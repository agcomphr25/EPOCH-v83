import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield, FileText, AlertTriangle } from 'lucide-react';
import { Link } from 'wouter';

export default function ShutdownProceduresTraining() {
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
            <Shield className="h-8 w-8 text-primary" />
            Shutdown Procedures Training
          </h1>
          <p className="text-gray-600 mt-1">Safety protocols and emergency shutdown procedures</p>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid gap-6">
        {/* Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Training Overview
            </CardTitle>
            <CardDescription>
              Essential safety training for all manufacturing personnel
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-3">Learning Objectives</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                    Understand emergency shutdown procedures for all equipment
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                    Identify emergency stop locations and controls
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                    Follow proper communication protocols during emergencies
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                    Execute safe evacuation procedures
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-3">Training Requirements</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Duration:</span>
                    <span className="font-medium">45 minutes</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Certification:</span>
                    <span className="font-medium">Annual</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Prerequisites:</span>
                    <span className="font-medium">Basic Safety Training</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Format:</span>
                    <span className="font-medium">Interactive + Practical</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Training Modules */}
        <Card>
          <CardHeader>
            <CardTitle>Training Modules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold text-lg mb-2">Module 1: General Procedures</h3>
                <p className="text-sm text-gray-600 mb-3">Basic shutdown protocols and safety measures</p>
                <Button variant="outline" size="sm" data-testid="button-module1">
                  Start Module
                </Button>
              </div>
              
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold text-lg mb-2">Module 2: Equipment-Specific</h3>
                <p className="text-sm text-gray-600 mb-3">Shutdown procedures for CNC, layup, and finish equipment</p>
                <Button variant="outline" size="sm" data-testid="button-module2">
                  Start Module
                </Button>
              </div>
              
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold text-lg mb-2">Module 3: Emergency Response</h3>
                <p className="text-sm text-gray-600 mb-3">Critical emergency shutdown and evacuation procedures</p>
                <Button variant="outline" size="sm" data-testid="button-module3">
                  Start Module
                </Button>
              </div>
              
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold text-lg mb-2">Module 4: Assessment</h3>
                <p className="text-sm text-gray-600 mb-3">Knowledge verification and certification</p>
                <Button variant="outline" size="sm" data-testid="button-assessment">
                  Take Assessment
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Important Notice */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-800 mb-1">Important Notice</h3>
                <p className="text-sm text-amber-700">
                  This training is mandatory for all manufacturing personnel. Completion is required before working with production equipment.
                  Contact your supervisor or HR for any questions regarding this training.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}