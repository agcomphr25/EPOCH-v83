import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, FileText } from 'lucide-react';
import { Link } from 'wouter';

const NonconformanceReport: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/nonconformance">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
          <h1 className="text-3xl font-bold text-gray-900">Nonconformance Report</h1>
        </div>
        
        <div className="flex space-x-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export to PDF
          </Button>
          <Button variant="outline">
            <FileText className="h-4 w-4 mr-2" />
            Print Report
          </Button>
        </div>
      </div>

      {/* Report Content */}
      <Card>
        <CardHeader>
          <CardTitle>Comprehensive Nonconformance Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Summary Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-red-50 p-4 rounded-lg border">
                <div className="text-2xl font-bold text-red-600">0</div>
                <div className="text-sm text-gray-600">Total Nonconformances</div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg border">
                <div className="text-2xl font-bold text-yellow-600">0</div>
                <div className="text-sm text-gray-600">Open Items</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg border">
                <div className="text-2xl font-bold text-green-600">0</div>
                <div className="text-sm text-gray-600">Resolved Items</div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg border">
                <div className="text-2xl font-bold text-blue-600">0%</div>
                <div className="text-sm text-gray-600">Resolution Rate</div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Issues by Cause</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center text-gray-500">
                    No data available for chart
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Dispositions Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 flex items-center justify-center text-gray-500">
                    No data available for chart
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Trends Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Monthly Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center text-gray-500">
                  No trend data available
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  No recent nonconformance records found
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NonconformanceReport;