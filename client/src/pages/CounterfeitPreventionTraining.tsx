import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield, AlertTriangle, Eye, Search, FileCheck } from 'lucide-react';
import { Link } from 'wouter';

export default function CounterfeitPreventionTraining() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-purple-600" />
            Counterfeit Prevention Training
          </h1>
          <p className="text-gray-600 mt-1">Detection and prevention of counterfeit parts and materials</p>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid gap-6">
        {/* Alert Banner */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-800 mb-1">Critical Training Notice</h3>
                <p className="text-sm text-amber-700">
                  The use of counterfeit parts poses serious safety and quality risks. All personnel must be trained to identify and prevent counterfeit materials from entering our supply chain.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Training Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Training Overview
            </CardTitle>
            <CardDescription>
              Comprehensive counterfeit detection and prevention training
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-3">Learning Objectives</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-purple-600 rounded-full mt-2 flex-shrink-0"></div>
                    Identify common signs of counterfeit parts
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-purple-600 rounded-full mt-2 flex-shrink-0"></div>
                    Understand verification procedures and documentation
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-purple-600 rounded-full mt-2 flex-shrink-0"></div>
                    Implement proper supplier validation processes
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-purple-600 rounded-full mt-2 flex-shrink-0"></div>
                    Report suspected counterfeit materials properly
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-purple-600 rounded-full mt-2 flex-shrink-0"></div>
                    Follow regulatory compliance requirements
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-3">Warning Signs</h3>
                <div className="space-y-2 text-sm">
                  <div className="p-3 border rounded bg-red-50 border-red-200">
                    <strong className="text-red-800">Visual Inspection:</strong><br />
                    Poor quality markings, wrong fonts, or missing logos
                  </div>
                  <div className="p-3 border rounded bg-red-50 border-red-200">
                    <strong className="text-red-800">Documentation:</strong><br />
                    Missing or fraudulent certificates and test reports
                  </div>
                  <div className="p-3 border rounded bg-red-50 border-red-200">
                    <strong className="text-red-800">Pricing:</strong><br />
                    Significantly below market prices or "too good to be true" deals
                  </div>
                  <div className="p-3 border rounded bg-red-50 border-red-200">
                    <strong className="text-red-800">Source:</strong><br />
                    Unverified suppliers or gray market distributors
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Training Modules */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Training Modules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold text-lg mb-2">Visual Inspection Techniques</h3>
                <p className="text-sm text-gray-600 mb-3">Learn to identify visual indicators of counterfeit parts</p>
                <Button variant="outline" size="sm" data-testid="button-visual">
                  Start Module
                </Button>
              </div>
              
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold text-lg mb-2">Documentation Verification</h3>
                <p className="text-sm text-gray-600 mb-3">Proper verification of certificates and test reports</p>
                <Button variant="outline" size="sm" data-testid="button-documentation">
                  Start Module
                </Button>
              </div>
              
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold text-lg mb-2">Supplier Validation</h3>
                <p className="text-sm text-gray-600 mb-3">Procedures for validating and approving suppliers</p>
                <Button variant="outline" size="sm" data-testid="button-supplier">
                  Start Module
                </Button>
              </div>
              
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold text-lg mb-2">Reporting Procedures</h3>
                <p className="text-sm text-gray-600 mb-3">How to report suspected counterfeit materials</p>
                <Button variant="outline" size="sm" data-testid="button-reporting">
                  Start Module
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Inspection Checklist */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              Quick Inspection Checklist
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-3">Physical Inspection</h3>
                <div className="space-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    Check part markings and logos
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    Verify dimensions and specifications
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    Inspect packaging and labeling
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    Check material quality and finish
                  </label>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-3">Documentation Review</h3>
                <div className="space-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    Verify certificate of conformity
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    Check test reports and data sheets
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    Validate traceability documentation
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    Confirm supplier authorization
                  </label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Regulatory Information */}
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-blue-800">Regulatory Compliance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-700 mb-3">
              This training covers requirements under various industry standards including AS9120, ISO 9001, and federal regulations.
              Completion is mandatory for all personnel involved in procurement, receiving, and quality control.
            </p>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="text-center p-3 bg-white rounded border">
                <div className="font-bold text-blue-600">AS9120</div>
                <div className="text-gray-600">Aerospace Standard</div>
              </div>
              <div className="text-center p-3 bg-white rounded border">
                <div className="font-bold text-blue-600">ISO 9001</div>
                <div className="text-gray-600">Quality Management</div>
              </div>
              <div className="text-center p-3 bg-white rounded border">
                <div className="font-bold text-blue-600">DoD 4140.1</div>
                <div className="text-gray-600">Defense Logistics</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}