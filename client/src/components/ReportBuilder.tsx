import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Download, FileText, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface Form {
  id: string;
  name: string;
  description: string;
  fields: any[];
}

interface FormSubmission {
  id: number;
  formId: string;
  data: Record<string, any>;
  createdAt: string;
}

export default function ReportBuilder() {
  const { toast } = useToast();
  const [selectedFormId, setSelectedFormId] = useState<string>('');

  // Fetch all forms
  const { data: forms, isLoading: formsLoading } = useQuery({
    queryKey: ['/api/forms'],
    queryFn: () => apiRequest('/api/forms')
  });

  // Fetch submissions for selected form
  const { data: submissions, isLoading: submissionsLoading } = useQuery({
    queryKey: ['/api/form-submissions', selectedFormId],
    queryFn: () => apiRequest(`/api/form-submissions?formId=${selectedFormId}`),
    enabled: !!selectedFormId
  });

  // Get all unique keys from submissions data
  const getAllDataKeys = (submissions: FormSubmission[]) => {
    const keys = new Set<string>();
    submissions.forEach(submission => {
      Object.keys(submission.data).forEach(key => keys.add(key));
    });
    return Array.from(keys);
  };

  // Export to CSV
  const exportToCSV = () => {
    if (!submissions || submissions.length === 0) {
      toast({ title: 'No Data', description: 'No submissions to export', variant: 'destructive' });
      return;
    }

    const keys = getAllDataKeys(submissions);
    const csvHeaders = ['ID', 'Submitted At', ...keys].join(',');
    
    const csvRows = submissions.map(submission => {
      const row = [
        submission.id,
        format(new Date(submission.createdAt), 'yyyy-MM-dd HH:mm:ss'),
        ...keys.map(key => {
          const value = submission.data[key];
          // Handle arrays and objects
          if (Array.isArray(value)) {
            return `"${value.join('; ')}"`;
          } else if (typeof value === 'object' && value !== null) {
            return `"${JSON.stringify(value)}"`;
          } else if (typeof value === 'string' && value.includes(',')) {
            return `"${value}"`;
          }
          return value || '';
        })
      ];
      return row.join(',');
    });

    const csvContent = [csvHeaders, ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedFormId}_submissions_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    
    URL.revokeObjectURL(url);
    toast({ title: 'Success', description: 'CSV exported successfully' });
  };

  if (formsLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">Loading forms...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Form Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Form Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label>Select Form</Label>
              <Select value={selectedFormId} onValueChange={setSelectedFormId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a form to view submissions" />
                </SelectTrigger>
                <SelectContent>
                  {forms?.map((form: Form) => (
                    <SelectItem key={form.id} value={form.id}>
                      {form.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedFormId && (
              <div className="flex gap-2">
                <Button 
                  onClick={exportToCSV}
                  disabled={!submissions || submissions.length === 0}
                  variant="outline"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Submissions Table */}
      {selectedFormId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Form Submissions
              {submissions && (
                <span className="text-sm text-gray-500">
                  ({submissions.length} submissions)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {submissionsLoading ? (
              <div className="text-center py-8">Loading submissions...</div>
            ) : submissions?.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No submissions found for this form
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 p-3 text-left">ID</th>
                      <th className="border border-gray-300 p-3 text-left">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          Submitted At
                        </div>
                      </th>
                      {getAllDataKeys(submissions || []).map((key) => (
                        <th key={key} className="border border-gray-300 p-3 text-left">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {submissions?.map((submission) => (
                      <tr key={submission.id} className="hover:bg-gray-50">
                        <td className="border border-gray-300 p-3 font-medium">
                          {submission.id}
                        </td>
                        <td className="border border-gray-300 p-3">
                          {format(new Date(submission.createdAt), 'MMM dd, yyyy HH:mm')}
                        </td>
                        {getAllDataKeys(submissions).map((key) => (
                          <td key={key} className="border border-gray-300 p-3">
                            {(() => {
                              const value = submission.data[key];
                              if (value === null || value === undefined) {
                                return <span className="text-gray-400">—</span>;
                              }
                              if (Array.isArray(value)) {
                                return (
                                  <div className="flex flex-wrap gap-1">
                                    {value.map((item, index) => (
                                      <span key={index} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                                        {item}
                                      </span>
                                    ))}
                                  </div>
                                );
                              }
                              if (typeof value === 'object') {
                                return (
                                  <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                                    {JSON.stringify(value)}
                                  </code>
                                );
                              }
                              if (typeof value === 'boolean') {
                                return (
                                  <span className={`px-2 py-1 rounded text-xs ${
                                    value ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                  }`}>
                                    {value ? 'Yes' : 'No'}
                                  </span>
                                );
                              }
                              // Handle date strings
                              if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
                                return format(new Date(value), 'MMM dd, yyyy');
                              }
                              return String(value);
                            })()}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}