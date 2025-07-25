import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Download, Trash2, Calendar, User, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface PurchaseReviewSubmission {
  id: number;
  customerId: string | null;
  formData: any;
  createdBy: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  updatedAt: string;
}

export default function PurchaseReviewSubmissions() {
  const [submissions, setSubmissions] = useState<PurchaseReviewSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<PurchaseReviewSubmission | null>(null);

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    try {
      const response = await fetch('/api/purchase-review-checklists');
      if (response.ok) {
        const data = await response.json();
        setSubmissions(data);
      }
    } catch (error) {
      console.error('Error fetching submissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'bg-gray-500';
      case 'SUBMITTED': return 'bg-blue-500';
      case 'APPROVED': return 'bg-green-500';
      case 'REJECTED': return 'bg-red-500';
      default: return 'bg-gray-500';
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

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this submission?')) return;

    try {
      const response = await fetch(`/api/purchase-review-checklists/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setSubmissions(prev => prev.filter(s => s.id !== id));
      } else {
        alert('Failed to delete submission');
      }
    } catch (error) {
      console.error('Error deleting submission:', error);
      alert('Failed to delete submission');
    }
  };

  const exportToCSV = (submission: PurchaseReviewSubmission) => {
    const data = submission.formData;
    const csvContent = Object.entries(data)
      .map(([key, value]) => `"${key}","${Array.isArray(value) ? value.join('; ') : value}"`)
      .join('\n');
    
    const csv = 'Field,Value\n' + csvContent;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase-review-${submission.id}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading submissions...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Purchase Review Checklist Submissions</h1>
          <p className="text-gray-600 mt-2">View and manage all purchase review checklist submissions</p>
        </div>

        {submissions.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No submissions found</h3>
              <p className="text-gray-600">Purchase review checklist submissions will appear here once created.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {submissions.map((submission) => (
              <Card key={submission.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <span>Submission #{submission.id}</span>
                        <Badge className={`${getStatusColor(submission.status)} text-white`}>
                          {submission.status}
                        </Badge>
                      </CardTitle>
                      <div className="flex items-center gap-4 text-sm text-gray-600 mt-2">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDate(submission.createdAt)}
                        </div>
                        {submission.createdBy && (
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            {submission.createdBy}
                          </div>
                        )}
                        {submission.customerId && (
                          <div className="text-blue-600 font-medium">
                            Customer: {submission.formData?.customerName || submission.customerId}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedSubmission(submission)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Purchase Review Checklist - Submission #{selectedSubmission?.id}</DialogTitle>
                          </DialogHeader>
                          {selectedSubmission && (
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <strong>Status:</strong> {selectedSubmission.status}
                                </div>
                                <div>
                                  <strong>Created:</strong> {formatDate(selectedSubmission.createdAt)}
                                </div>
                                <div>
                                  <strong>Created By:</strong> {selectedSubmission.createdBy || 'Unknown'}
                                </div>
                                <div>
                                  <strong>Customer:</strong> {selectedSubmission.formData?.customerName || 'Not specified'}
                                </div>
                              </div>
                              
                              <div className="border-t pt-4">
                                <h4 className="font-medium mb-3">Form Data:</h4>
                                <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
                                  <pre className="text-sm whitespace-pre-wrap">
                                    {JSON.stringify(selectedSubmission.formData, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportToCSV(submission)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Export
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(submission.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="text-sm text-gray-600">
                    {submission.formData?.customerName && (
                      <p><strong>Customer:</strong> {submission.formData.customerName}</p>
                    )}
                    {submission.formData?.projectName && (
                      <p><strong>Project:</strong> {submission.formData.projectName}</p>
                    )}
                    {submission.formData?.quantity && (
                      <p><strong>Quantity:</strong> {submission.formData.quantity}</p>
                    )}
                    {submission.formData?.unitPrice && (
                      <p><strong>Unit Price:</strong> ${submission.formData.unitPrice}</p>
                    )}
                    {submission.formData?.amount && (
                      <p><strong>Total Amount:</strong> ${submission.formData.amount}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}