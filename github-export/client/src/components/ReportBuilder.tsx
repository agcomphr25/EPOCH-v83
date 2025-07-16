import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Download, FileText } from 'lucide-react';

interface FormData {
  id: number;
  name: string;
  description: string;
  fields: any[];
}

interface FormSubmission {
  id: number;
  formId: number;
  data: Record<string, any>;
  createdAt: string;
}

export default function ReportBuilder() {
  const [selectedFormId, setSelectedFormId] = useState<string>('');

  // Fetch forms list
  const { data: forms = [], isLoading: loadingForms } = useQuery<FormData[]>({
    queryKey: ['/api/forms'],
  });

  // Fetch submissions for selected form
  const { data: submissions = [], isLoading: loadingSubmissions } = useQuery<FormSubmission[]>({
    queryKey: ['/api/form-submissions', selectedFormId],
    queryFn: () => apiRequest(`/api/form-submissions?formId=${selectedFormId}`),
    enabled: !!selectedFormId,
  });

  if (loadingForms) return <div>Loading forms...</div>;

  // Derive columns from first submission's data keys
  const columns = submissions.length > 0 ? Object.keys(submissions[0].data) : [];

  const exportToCsv = () => {
    if (submissions.length === 0) return;

    const headers = [...columns, 'Submitted At'];
    const csvContent = [
      headers.join(','),
      ...submissions.map(s => [
        ...columns.map(col => `"${String(s.data[col] || '').replace(/"/g, '""')}"`),
        `"${new Date(s.createdAt).toLocaleString()}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `form-${selectedFormId}-submissions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Report Builder</h1>
        {submissions.length > 0 && (
          <Button onClick={exportToCsv} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Form Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Form</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Choose a form to view submissions</Label>
            <Select value={selectedFormId} onValueChange={setSelectedFormId}>
              <SelectTrigger>
                <SelectValue placeholder="— Choose a form —" />
              </SelectTrigger>
              <SelectContent>
                {forms.map(form => (
                  <SelectItem key={form.id} value={form.id.toString()}>
                    {form.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Submissions Table */}
      {selectedFormId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Form Submissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSubmissions ? (
              <div>Loading submissions...</div>
            ) : submissions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No submissions found for this form
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      {columns.map(col => (
                        <th key={col} className="border border-gray-300 p-2 text-left font-medium">
                          {col}
                        </th>
                      ))}
                      <th className="border border-gray-300 p-2 text-left font-medium">
                        Submitted At
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map(submission => (
                      <tr key={submission.id} className="hover:bg-gray-50">
                        {columns.map(col => (
                          <td key={col} className="border border-gray-300 p-2">
                            {typeof submission.data[col] === 'boolean'
                              ? submission.data[col] ? 'Yes' : 'No'
                              : String(submission.data[col] || '')
                            }
                          </td>
                        ))}
                        <td className="border border-gray-300 p-2">
                          {new Date(submission.createdAt).toLocaleString()}
                        </td>
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