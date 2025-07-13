import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock, Plus, FileText, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { QcDefinition, QcSubmission } from '@shared/schema';

export default function QCManager() {
  const [activeTab, setActiveTab] = useState("submissions");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch QC submissions
  const { data: submissions = [], isLoading: submissionsLoading } = useQuery({
    queryKey: ['/api/qc-submissions'],
    queryFn: async () => {
      const response = await fetch('/api/qc-submissions');
      if (!response.ok) throw new Error('Failed to fetch QC submissions');
      return response.json() as Promise<QcSubmission[]>;
    }
  });

  // Fetch QC definitions
  const { data: definitions = [], isLoading: definitionsLoading } = useQuery({
    queryKey: ['/api/qc-definitions'],
    queryFn: async () => {
      const response = await fetch('/api/qc-definitions');
      if (!response.ok) throw new Error('Failed to fetch QC definitions');
      return response.json() as Promise<QcDefinition[]>;
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PASS':
        return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle className="h-3 w-3 mr-1" />PASS</Badge>;
      case 'FAIL':
        return <Badge className="bg-red-100 text-red-800 border-red-200"><XCircle className="h-3 w-3 mr-1" />FAIL</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200"><Clock className="h-3 w-3 mr-1" />PENDING</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Quality Control Manager</h1>
          <p className="text-gray-600 mt-2">Manage QC processes and submissions</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New QC Check
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="submissions">QC Submissions</TabsTrigger>
          <TabsTrigger value="definitions">QC Definitions</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="submissions" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                QC Submissions
              </CardTitle>
              <CardDescription>
                View and manage quality control submissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {submissionsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : submissions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No QC submissions found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {submissions.map((submission) => (
                    <div key={submission.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-semibold text-lg">Order #{submission.orderId}</h3>
                          <p className="text-sm text-gray-600">
                            {submission.line} • {submission.department} • SKU: {submission.sku}
                          </p>
                        </div>
                        {getStatusBadge(submission.summary || 'pending')}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Submitted:</span> {submission.submittedAt ? formatDate(submission.submittedAt) : 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium">Due:</span> {submission.dueDate ? formatDate(submission.dueDate) : 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium">Submitted by:</span> {submission.submittedBy || 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium">Status:</span> {submission.status}
                        </div>
                      </div>
                      
                      {submission.final && (
                        <Badge className="mt-2 bg-blue-100 text-blue-800 border-blue-200">
                          Final Inspection
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="definitions" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                QC Definitions
              </CardTitle>
              <CardDescription>
                Configure quality control checkpoints and requirements
              </CardDescription>
            </CardHeader>
            <CardContent>
              {definitionsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : definitions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Settings className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No QC definitions found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {definitions.map((definition) => (
                    <div key={definition.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-semibold">{definition.label}</h3>
                          <p className="text-sm text-gray-600">
                            {definition.line} • {definition.department} • {definition.type}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {definition.required && (
                            <Badge variant="destructive">Required</Badge>
                          )}
                          {definition.final && (
                            <Badge className="bg-blue-100 text-blue-800 border-blue-200">Final</Badge>
                          )}
                          {definition.isActive && (
                            <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">Key:</span> {definition.key}
                      </div>
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">Sort Order:</span> {definition.sortOrder}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>QC Analytics</CardTitle>
              <CardDescription>
                Quality control metrics and performance analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-6 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {submissions.filter(s => s.summary === 'PASS').length}
                  </div>
                  <div className="text-sm text-green-700">Passed Inspections</div>
                </div>
                
                <div className="text-center p-6 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {submissions.filter(s => s.summary === 'FAIL').length}
                  </div>
                  <div className="text-sm text-red-700">Failed Inspections</div>
                </div>
                
                <div className="text-center p-6 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">
                    {submissions.filter(s => !s.summary || s.summary === 'pending').length}
                  </div>
                  <div className="text-sm text-yellow-700">Pending Inspections</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}