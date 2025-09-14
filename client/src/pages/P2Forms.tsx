import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
<<<<<<< HEAD
import { FileText, Download, Printer, ClipboardList, Package, Receipt, Barcode, Calendar, Award, GraduationCap } from "lucide-react";
=======
import { FileText, Download, Printer, ClipboardList, Package, Receipt, Barcode, Calendar, Award } from "lucide-react";
>>>>>>> origin/main
import { Link } from "wouter";

export default function P2Forms() {
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">P2 Forms</h1>
          <p className="text-gray-600">
            Specialized forms and documentation for P2 operations and workflow management
          </p>
        </div>

        {/* Forms Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Production Order Forms */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-blue-600" />
                Production Order Forms
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Generate and manage production order documentation
              </p>
              <div className="space-y-2">
                <Link href="/purchase-review-checklist">
                  <Button className="w-full justify-start" variant="outline">
                    <ClipboardList className="h-4 w-4 mr-2" />
                    Purchase Review Checklist
                  </Button>
                </Link>
                <Link href="/purchase-review-submissions">
                  <Button className="w-full justify-start" variant="outline">
                    <FileText className="h-4 w-4 mr-2" />
                    View Submissions
                  </Button>
                </Link>
                <Link href="/rfq-risk-assessment">
                  <Button className="w-full justify-start" variant="outline">
                    <ClipboardList className="h-4 w-4 mr-2" />
                    RFQ Risk Assessment
                  </Button>
                </Link>
                <Button className="w-full justify-start" variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  Production Work Orders
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <Calendar className="h-4 w-4 mr-2" />
                  Production Schedule Report
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <Package className="h-4 w-4 mr-2" />
                  BOM Production Forms
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quality Control Forms */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-green-600" />
                Quality Control Forms
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                QC inspection and validation forms for P2 products
              </p>
              <div className="space-y-2">
                <Button className="w-full justify-start" variant="outline">
                  <ClipboardList className="h-4 w-4 mr-2" />
                  QC Inspection Checklist
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  Quality Assurance Report
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <Package className="h-4 w-4 mr-2" />
                  Final Inspection Form
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Shipping & Documentation */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-purple-600" />
                Shipping & Documentation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Shipping forms and delivery documentation
              </p>
              <div className="space-y-2">
                <Link href="/packing-slip">
                  <Button className="w-full justify-start" variant="outline">
                    <Receipt className="h-4 w-4 mr-2" />
                    Packing Slip
                  </Button>
                </Link>
                <Button className="w-full justify-start" variant="outline">
                  <Barcode className="h-4 w-4 mr-2" />
                  Shipping Labels
                </Button>
                <Link href="/manufacturers-certificate">
                  <Button className="w-full justify-start" variant="outline">
                    <Award className="h-4 w-4 mr-2" />
                    Manufacturer's Certificate of Conformance
                  </Button>
                </Link>
                <Button className="w-full justify-start" variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  Certificate of Compliance
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Inventory & Receiving Forms */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-orange-600" />
                Inventory & Receiving
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Inventory management and receiving documentation
              </p>
              <div className="space-y-2">
                <Button className="w-full justify-start" variant="outline">
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Receiving Report
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <Package className="h-4 w-4 mr-2" />
                  Inventory Count Sheet
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <Barcode className="h-4 w-4 mr-2" />
                  Material Labels
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Custom Reports */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-red-600" />
                Custom Reports
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Customizable reports and form templates
              </p>
              <div className="space-y-2">
                <Button className="w-full justify-start" variant="outline">
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Custom Form Builder
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export Templates
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <Printer className="h-4 w-4 mr-2" />
                  Print Manager
                </Button>
              </div>
            </CardContent>
          </Card>

<<<<<<< HEAD
          {/* Training Forms */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-indigo-600" />
                Training Forms
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Training and procedure documentation forms with digital signatures
              </p>
              <div className="space-y-2">
                <Link href="/enhanced-forms?categoryId=6">
                  <Button className="w-full justify-start" variant="outline">
                    <GraduationCap className="h-4 w-4 mr-2" />
                    Leader Training Forms
                  </Button>
                </Link>
                <Link href="/enhanced-forms?categoryId=6">
                  <Button className="w-full justify-start" variant="outline">
                    <ClipboardList className="h-4 w-4 mr-2" />
                    Shutdown Procedures
                  </Button>
                </Link>
                <Link href="/enhanced-forms?categoryId=6">
                  <Button className="w-full justify-start" variant="outline">
                    <FileText className="h-4 w-4 mr-2" />
                    Training Documentation
                  </Button>
                </Link>
                <Link href="/enhanced-forms?mode=create&categoryId=6">
                  <Button className="w-full justify-start" variant="outline">
                    <ClipboardList className="h-4 w-4 mr-2" />
                    Create Training Form
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

=======
>>>>>>> origin/main
          {/* Compliance & Documentation */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-teal-600" />
                Compliance & Documentation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Regulatory compliance and audit documentation
              </p>
              <div className="space-y-2">
                <Link href="/waste-management-form">
                  <Button className="w-full justify-start" variant="outline">
                    <FileText className="h-4 w-4 mr-2" />
                    Waste Management Form
                  </Button>
                </Link>
                <Button className="w-full justify-start" variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  Audit Trail Report
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Compliance Checklist
                </Button>
                <Button className="w-full justify-start" variant="outline">
                  <Receipt className="h-4 w-4 mr-2" />
                  Documentation Package
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Quick Actions Footer */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <Button>
              <Download className="h-4 w-4 mr-2" />
              Bulk Export Forms
            </Button>
            <Button variant="outline">
              <Printer className="h-4 w-4 mr-2" />
              Print All Forms
            </Button>
            <Button variant="outline">
              <ClipboardList className="h-4 w-4 mr-2" />
              Form Templates
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}