import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CSVLink } from 'react-csv';
import html2pdf from 'html2pdf.js';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  FileText, 
  Download, 
  FileDown, 
  FileBarChart, 
  Filter,
  Calendar,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Users,
  Clock
} from 'lucide-react';

import { apiRequest } from '@/lib/queryClient';

interface EnhancedForm {
  id: number;
  name: string;
  description?: string;
  categoryId?: number;
  version: number;
  createdAt: string;
}

interface FormSubmission {
  id: number;
  formId: number;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export default function EnhancedReportBuilder() {
  const [selectedFormId, setSelectedFormId] = useState<string>('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredData, setFilteredData] = useState<FormSubmission[]>([]);
  const reportRef = useRef<HTMLDivElement>(null);

  // Fetch forms
  const { data: forms = [], isLoading: loadingForms } = useQuery<EnhancedForm[]>({
    queryKey: ['/api/enhanced-forms'],
    queryFn: () => apiRequest('/api/enhanced-forms'),
  });

  // Fetch submissions for selected form
  const { data: submissions = [], isLoading: loadingSubmissions, refetch } = useQuery<FormSubmission[]>({
    queryKey: ['/api/enhanced-forms/submissions', selectedFormId],
    queryFn: () => apiRequest('/api/enhanced-forms/submissions', { params: { formId: selectedFormId } }),
    enabled: !!selectedFormId,
  });

  // Filter submissions based on date range and search term
  React.useEffect(() => {
    let filtered = [...submissions];

    // Date filter
    if (dateFilter.start) {
      filtered = filtered.filter(s => new Date(s.createdAt) >= new Date(dateFilter.start));
    }
    if (dateFilter.end) {
      filtered = filtered.filter(s => new Date(s.createdAt) <= new Date(dateFilter.end));
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(s => 
        JSON.stringify(s.data).toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredData(filtered);
  }, [submissions, dateFilter, searchTerm]);

  // Get selected form info
  const selectedForm = forms.find(f => f.id.toString() === selectedFormId);

  // Get all unique column keys from submissions
  const columns = filteredData.length > 0 
    ? Array.from(new Set(filteredData.flatMap(s => Object.keys(s.data))))
    : [];

  // Export to CSV
  const exportToCsv = () => {
    if (filteredData.length === 0) {
      toast.error('No data to export');
      return;
    }

    const csvData = filteredData.map(s => ({
      ...s.data,
      'Submission ID': s.id,
      'Submitted At': new Date(s.createdAt).toLocaleString()
    }));

    return csvData;
  };

  // Export to JSON
  const exportToJson = () => {
    if (filteredData.length === 0) {
      toast.error('No data to export');
      return;
    }

    const jsonData = {
      form: selectedForm,
      submissions: filteredData,
      exported_at: new Date().toISOString(),
      total_submissions: filteredData.length
    };

    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedForm?.name || 'form'}-submissions.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('JSON exported successfully');
  };

  // Export to PDF
  const exportToPdf = () => {
    if (!reportRef.current) return;

    const opt = {
      margin: 1,
      filename: `${selectedForm?.name || 'form'}-report.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'landscape' }
    };

    html2pdf().from(reportRef.current).set(opt).save();
  };

  // Calculate summary statistics
  const summaryStats = {
    totalSubmissions: filteredData.length,
    todaySubmissions: filteredData.filter(s => 
      new Date(s.createdAt).toDateString() === new Date().toDateString()
    ).length,
    avgSubmissionsPerDay: filteredData.length > 0 
      ? Math.round(filteredData.length / Math.max(1, 
          Math.ceil((new Date().getTime() - new Date(Math.min(...filteredData.map(s => new Date(s.createdAt).getTime()))).getTime()) / (1000 * 60 * 60 * 24))
        ))
      : 0,
    dateRange: filteredData.length > 0 
      ? {
          start: new Date(Math.min(...filteredData.map(s => new Date(s.createdAt).getTime()))),
          end: new Date(Math.max(...filteredData.map(s => new Date(s.createdAt).getTime())))
        }
      : null
  };

  if (loadingForms) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading forms...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Enhanced Report Builder</h1>
        <Button onClick={() => refetch()} variant="outline" className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Form Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Select Form
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="form-select">Choose a form to view submissions</Label>
              <Select value={selectedFormId} onValueChange={setSelectedFormId}>
                <SelectTrigger id="form-select">
                  <SelectValue placeholder="— Select a form —" />
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
            
            {selectedForm && (
              <div className="flex items-end">
                <Badge variant="outline" className="h-fit">
                  Version {selectedForm.version}
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      {selectedFormId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={dateFilter.start}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={dateFilter.end}
                  onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="search">Search in Data</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="search"
                    placeholder="Search submissions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Statistics */}
      {selectedFormId && filteredData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileBarChart className="h-5 w-5" />
              Summary Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{summaryStats.totalSubmissions}</div>
                <div className="text-sm text-gray-600 flex items-center justify-center gap-1">
                  <Users className="h-4 w-4" />
                  Total Submissions
                </div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{summaryStats.todaySubmissions}</div>
                <div className="text-sm text-gray-600 flex items-center justify-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Today's Submissions
                </div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{summaryStats.avgSubmissionsPerDay}</div>
                <div className="text-sm text-gray-600 flex items-center justify-center gap-1">
                  <Clock className="h-4 w-4" />
                  Avg. per Day
                </div>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <div className="text-sm font-bold text-orange-600">
                  {summaryStats.dateRange 
                    ? `${summaryStats.dateRange.start.toLocaleDateString()} - ${summaryStats.dateRange.end.toLocaleDateString()}`
                    : 'No data'
                  }
                </div>
                <div className="text-sm text-gray-600">Date Range</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Export Options */}
      {selectedFormId && filteredData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export Options
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <CSVLink
                data={exportToCsv() || []}
                filename={`${selectedForm?.name || 'form'}-submissions.csv`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                <FileDown className="h-4 w-4" />
                Export CSV
              </CSVLink>

              <Button onClick={exportToJson} variant="outline" className="flex items-center gap-2">
                <FileDown className="h-4 w-4" />
                Export JSON
              </Button>

              <Button onClick={exportToPdf} variant="outline" className="flex items-center gap-2">
                <FileDown className="h-4 w-4" />
                Export PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Table */}
      {selectedFormId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Form Submissions
              {loadingSubmissions && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 ml-2"></div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSubmissions ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p>Loading submissions...</p>
              </div>
            ) : filteredData.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-semibold text-gray-600">No submissions found</p>
                <p className="text-gray-500">
                  {submissions.length === 0 
                    ? 'This form has no submissions yet' 
                    : 'No submissions match your current filters'
                  }
                </p>
              </div>
            ) : (
              <div ref={reportRef} className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-4 py-2 text-left">ID</th>
                      {columns.map(col => (
                        <th key={col} className="border border-gray-300 px-4 py-2 text-left">
                          {col.charAt(0).toUpperCase() + col.slice(1)}
                        </th>
                      ))}
                      <th className="border border-gray-300 px-4 py-2 text-left">Submitted At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map(submission => (
                      <tr key={submission.id} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-4 py-2 font-mono text-sm">
                          {submission.id}
                        </td>
                        {columns.map(col => (
                          <td key={col} className="border border-gray-300 px-4 py-2">
                            {submission.data[col] ? (
                              typeof submission.data[col] === 'boolean' ? (
                                submission.data[col] ? (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                ) : (
                                  <span className="text-gray-400">No</span>
                                )
                              ) : (
                                String(submission.data[col])
                              )
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        ))}
                        <td className="border border-gray-300 px-4 py-2 text-sm">
                          {new Date(submission.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {filteredData.length > 0 && (
                  <div className="mt-4 text-sm text-gray-600 text-center">
                    Showing {filteredData.length} of {submissions.length} submissions
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}