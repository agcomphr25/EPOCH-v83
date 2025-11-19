import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Eye,
  Download,
  Trash2,
  Calendar,
  User,
  FileText,
  Plus,
  Edit,
  Save,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Link } from 'wouter';

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
  const [submissions, setSubmissions] = useState<PurchaseReviewSubmission[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] =
    useState<PurchaseReviewSubmission | null>(null);
  const [editingSubmission, setEditingSubmission] =
    useState<PurchaseReviewSubmission | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    try {
      const response = await fetch('/api/purchase-review-submissions');
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
      case 'DRAFT':
        return 'bg-gray-500';
      case 'SUBMITTED':
        return 'bg-blue-500';
      case 'APPROVED':
        return 'bg-green-500';
      case 'REJECTED':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this submission?')) return;

    try {
      const response = await fetch(`/api/purchase-review-submissions/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSubmissions((prev) => prev.filter((s) => s.id !== id));
        alert('Submission deleted successfully');
      } else {
        alert('Failed to delete submission');
      }
    } catch (error) {
      console.error('Error deleting submission:', error);
      alert('Failed to delete submission');
    }
  };

  const handleEdit = (submission: PurchaseReviewSubmission) => {
    setEditingSubmission({ ...submission });
  };

  const handleSaveEdit = async () => {
    if (!editingSubmission) return;

    try {
      const response = await fetch(
        `/api/purchase-review-submissions/${editingSubmission.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customerId: editingSubmission.customerId,
            formData: editingSubmission.formData,
            createdBy: editingSubmission.createdBy,
            status: editingSubmission.status,
          }),
        }
      );

      if (response.ok) {
        const updatedSubmission = await response.json();
        setSubmissions((prev) =>
          prev.map((s) =>
            s.id === editingSubmission.id ? updatedSubmission : s
          )
        );
        setEditingSubmission(null);
        alert('Submission updated successfully');
      } else {
        alert('Failed to update submission');
      }
    } catch (error) {
      console.error('Error updating submission:', error);
      alert('Failed to update submission');
    }
  };

  const handleCancelEdit = () => {
    setEditingSubmission(null);
  };

  const handleCreateNew = () => {
    setIsCreateDialogOpen(false);
    // Navigate to the Purchase Review Checklist form
    window.location.href = '/purchase-review-checklist';
  };

  const handleStatusChange = (newStatus: string) => {
    if (!editingSubmission) return;
    setEditingSubmission({
      ...editingSubmission,
      status: newStatus as PurchaseReviewSubmission['status'],
    });
  };

  const filteredSubmissions = submissions.filter((submission) => {
    const matchesSearch =
      searchQuery === '' ||
      submission.formData?.customerName
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      submission.formData?.projectName
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      submission.id.toString().includes(searchQuery);

    const matchesStatus =
      statusFilter === 'all' || submission.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const exportToCSV = (submission: PurchaseReviewSubmission) => {
    const data = submission.formData;
    const csvContent = Object.entries(data)
      .map(
        ([key, value]) =>
          `"${key}","${Array.isArray(value) ? value.join('; ') : value}"`
      )
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
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Purchase Review Checklist Submissions
              </h1>
              <p className="text-gray-600 mt-2">
                View and manage all purchase review checklist submissions
              </p>
            </div>
            <Dialog
              open={isCreateDialogOpen}
              onOpenChange={setIsCreateDialogOpen}
            >
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Submission
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    Create New Purchase Review Checklist
                  </DialogTitle>
                </DialogHeader>
                <div className="py-4">
                  <p className="text-gray-600 mb-4">
                    Click the button below to navigate to the Purchase Review
                    Checklist form to create a new submission.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      onClick={handleCreateNew}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Go to Form
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsCreateDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Search and Filter Controls */}
          <div className="mt-6 flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="search">Search Submissions</Label>
              <Input
                id="search"
                placeholder="Search by customer name, project, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="sm:w-48">
              <Label htmlFor="status-filter">Filter by Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="SUBMITTED">Submitted</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Results Summary */}
          <div className="mt-4 text-sm text-gray-600">
            Showing {filteredSubmissions.length} of {submissions.length}{' '}
            submissions
          </div>
        </div>

        {filteredSubmissions.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {submissions.length === 0
                  ? 'No submissions found'
                  : 'No submissions match your filters'}
              </h3>
              <p className="text-gray-600">
                {submissions.length === 0
                  ? 'Purchase review checklist submissions will appear here once created.'
                  : 'Try adjusting your search terms or filters to find submissions.'}
              </p>
              {submissions.length === 0 && (
                <Link href="/purchase-review-checklist">
                  <Button className="mt-4">
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Submission
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {filteredSubmissions.map((submission) => (
              <Card
                key={submission.id}
                className="hover:shadow-md transition-shadow"
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <span>
                          PO #
                          {submission.formData?.poNumber ||
                            `SUB-${submission.id}`}
                        </span>
                        <Badge
                          className={`${getStatusColor(submission.status)} text-white`}
                        >
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
                            Customer:{' '}
                            {submission.formData?.customerName ||
                              submission.customerId}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {editingSubmission?.id === submission.id ? (
                        <>
                          <Button
                            size="sm"
                            onClick={handleSaveEdit}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Save className="h-4 w-4 mr-1" />
                            Save
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCancelEdit}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setSelectedSubmission(submission)
                                }
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>
                                  Purchase Review Checklist - PO #
                                  {selectedSubmission?.formData?.poNumber ||
                                    `SUB-${selectedSubmission?.id}`}
                                </DialogTitle>
                              </DialogHeader>
                              {selectedSubmission && (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                      <strong>Status:</strong>{' '}
                                      {selectedSubmission.status}
                                    </div>
                                    <div>
                                      <strong>Created:</strong>{' '}
                                      {formatDate(selectedSubmission.createdAt)}
                                    </div>
                                    <div>
                                      <strong>Created By:</strong>{' '}
                                      {selectedSubmission.createdBy ||
                                        'Unknown'}
                                    </div>
                                    <div>
                                      <strong>Customer:</strong>{' '}
                                      {selectedSubmission.formData
                                        ?.customerName || 'Not specified'}
                                    </div>
                                  </div>

                                  <div className="border-t pt-4 space-y-6">
                                    {/* Section A - Customer Information */}
                                    <div>
                                      <h4 className="font-semibold text-lg mb-3 text-blue-700">
                                        Section A - Customer Information
                                      </h4>
                                      <div className="grid grid-cols-2 gap-3 text-sm">
                                        {selectedSubmission.formData?.companyName && (
                                          <div>
                                            <span className="font-medium">Company Name:</span>{' '}
                                            {selectedSubmission.formData.companyName}
                                          </div>
                                        )}
                                        {selectedSubmission.formData?.address && (
                                          <div>
                                            <span className="font-medium">Address:</span>{' '}
                                            {selectedSubmission.formData.address}
                                          </div>
                                        )}
                                        {selectedSubmission.formData?.email && (
                                          <div>
                                            <span className="font-medium">Email:</span>{' '}
                                            {selectedSubmission.formData.email}
                                          </div>
                                        )}
                                        {selectedSubmission.formData?.phone && (
                                          <div>
                                            <span className="font-medium">Phone:</span>{' '}
                                            {selectedSubmission.formData.phone}
                                          </div>
                                        )}
                                        {selectedSubmission.formData?.poNumber && (
                                          <div>
                                            <span className="font-medium">PO Number:</span>{' '}
                                            {selectedSubmission.formData.poNumber}
                                          </div>
                                        )}
                                        {selectedSubmission.formData?.paymentTerms && (
                                          <div>
                                            <span className="font-medium">Payment Terms:</span>{' '}
                                            {selectedSubmission.formData.paymentTerms}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Section B - Service/Product Information */}
                                    {(selectedSubmission.formData?.quantityRequested || 
                                      selectedSubmission.formData?.unitPrice ||
                                      selectedSubmission.formData?.amount) && (
                                      <div>
                                        <h4 className="font-semibold text-lg mb-3 text-blue-700">
                                          Section B - Service/Product Requested
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                          {selectedSubmission.formData?.quantityRequested && (
                                            <div>
                                              <span className="font-medium">Quantity:</span>{' '}
                                              {selectedSubmission.formData.quantityRequested}
                                            </div>
                                          )}
                                          {selectedSubmission.formData?.unitOfMeasure && (
                                            <div>
                                              <span className="font-medium">Unit of Measure:</span>{' '}
                                              {selectedSubmission.formData.unitOfMeasure}
                                            </div>
                                          )}
                                          {selectedSubmission.formData?.unitPrice && (
                                            <div>
                                              <span className="font-medium">Unit Price:</span> $
                                              {selectedSubmission.formData.unitPrice}
                                            </div>
                                          )}
                                          {selectedSubmission.formData?.toolingPrice && (
                                            <div>
                                              <span className="font-medium">Tooling Price:</span> $
                                              {selectedSubmission.formData.toolingPrice}
                                            </div>
                                          )}
                                          {selectedSubmission.formData?.amount && (
                                            <div className="col-span-2">
                                              <span className="font-medium text-lg">Total Amount:</span>{' '}
                                              <span className="text-lg font-bold text-green-600">
                                                ${selectedSubmission.formData.amount}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Item Numbers */}
                                    {(selectedSubmission.formData?.level1ItemNumber || 
                                      selectedSubmission.formData?.level2ItemNumber ||
                                      selectedSubmission.formData?.level3ItemNumber) && (
                                      <div>
                                        <h4 className="font-semibold text-lg mb-3 text-blue-700">
                                          Item Numbers
                                        </h4>
                                        <div className="grid grid-cols-3 gap-3 text-sm">
                                          {selectedSubmission.formData?.level1ItemNumber && (
                                            <div>
                                              <span className="font-medium">Level 1 Assembly:</span>{' '}
                                              {selectedSubmission.formData.level1ItemNumber}
                                            </div>
                                          )}
                                          {selectedSubmission.formData?.level2ItemNumber && (
                                            <div>
                                              <span className="font-medium">Level 2 CNC:</span>{' '}
                                              {selectedSubmission.formData.level2ItemNumber}
                                            </div>
                                          )}
                                          {selectedSubmission.formData?.level3ItemNumber && (
                                            <div>
                                              <span className="font-medium">Level 3 Manufacturing:</span>{' '}
                                              {selectedSubmission.formData.level3ItemNumber}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Section E - Shipping */}
                                    {(selectedSubmission.formData?.shipToInformation || 
                                      selectedSubmission.formData?.deliverySchedule ||
                                      selectedSubmission.formData?.shippingCompany) && (
                                      <div>
                                        <h4 className="font-semibold text-lg mb-3 text-blue-700">
                                          Section E - Shipping
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                          {selectedSubmission.formData?.shippingCompany && (
                                            <div>
                                              <span className="font-medium">Shipping Company:</span>{' '}
                                              {selectedSubmission.formData.shippingCompany}
                                            </div>
                                          )}
                                          {selectedSubmission.formData?.deliverySchedule && (
                                            <div>
                                              <span className="font-medium">Delivery Schedule:</span>{' '}
                                              {selectedSubmission.formData.deliverySchedule}
                                            </div>
                                          )}
                                          {selectedSubmission.formData?.shipToInformation && (
                                            <div className="col-span-2">
                                              <span className="font-medium">Ship To:</span>
                                              <div className="mt-1 p-2 bg-gray-50 rounded">
                                                {selectedSubmission.formData.shipToInformation}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Section F - Special Requirements */}
                                    {(selectedSubmission.formData?.certifications?.length > 0 || 
                                      selectedSubmission.formData?.dpasRating) && (
                                      <div>
                                        <h4 className="font-semibold text-lg mb-3 text-blue-700">
                                          Section F - Special Requirements
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                          {selectedSubmission.formData?.certifications?.length > 0 && (
                                            <div>
                                              <span className="font-medium">Certifications:</span>{' '}
                                              {selectedSubmission.formData.certifications.join(', ')}
                                            </div>
                                          )}
                                          {selectedSubmission.formData?.dpasRating && (
                                            <div>
                                              <span className="font-medium">DPAS Rating:</span> D
                                              {selectedSubmission.formData.dpasRating}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Reviewer Information */}
                                    {(selectedSubmission.formData?.reviewerName || 
                                      selectedSubmission.formData?.acceptance ||
                                      selectedSubmission.formData?.date) && (
                                      <div>
                                        <h4 className="font-semibold text-lg mb-3 text-blue-700">
                                          Reviewer Information
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                          {selectedSubmission.formData?.reviewerName && (
                                            <div>
                                              <span className="font-medium">Reviewer:</span>{' '}
                                              {selectedSubmission.formData.reviewerName}
                                            </div>
                                          )}
                                          {selectedSubmission.formData?.acceptance && (
                                            <div>
                                              <span className="font-medium">Acceptance:</span>{' '}
                                              {selectedSubmission.formData.acceptance}
                                            </div>
                                          )}
                                          {selectedSubmission.formData?.date && (
                                            <div>
                                              <span className="font-medium">Date:</span>{' '}
                                              {new Date(selectedSubmission.formData.date).toLocaleDateString()}
                                            </div>
                                          )}
                                          {selectedSubmission.formData?.signature && (
                                            <div className="col-span-2">
                                              <span className="font-medium">Signature:</span>
                                              <div className="mt-2 border rounded p-2 bg-white">
                                                <img 
                                                  src={selectedSubmission.formData.signature} 
                                                  alt="Digital Signature"
                                                  className="max-h-32"
                                                />
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Raw JSON (Collapsed) */}
                                    <details className="border-t pt-4">
                                      <summary className="font-medium cursor-pointer text-gray-600 hover:text-gray-900">
                                        View Raw JSON Data
                                      </summary>
                                      <div className="bg-gray-50 p-4 rounded-lg mt-2 max-h-96 overflow-y-auto">
                                        <pre className="text-xs whitespace-pre-wrap">
                                          {JSON.stringify(
                                            selectedSubmission.formData,
                                            null,
                                            2
                                          )}
                                        </pre>
                                      </div>
                                    </details>
                                  </div>
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>

                          {submission.status === 'DRAFT' && (
                            <Link href={`/purchase-review-checklist?id=${submission.id}`}>
                              <Button
                                variant="outline"
                                size="sm"
                                className="bg-blue-50 hover:bg-blue-100 border-blue-200"
                                data-testid={`button-edit-in-form-${submission.id}`}
                              >
                                <FileText className="h-4 w-4 mr-1" />
                                Edit in Form
                              </Button>
                            </Link>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(submission)}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                          </Button>

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
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {editingSubmission?.id === submission.id ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="edit-customer">Customer ID</Label>
                          <Input
                            id="edit-customer"
                            value={editingSubmission.customerId || ''}
                            onChange={(e) =>
                              setEditingSubmission({
                                ...editingSubmission,
                                customerId: e.target.value,
                              })
                            }
                            placeholder="Customer ID"
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-status">Status</Label>
                          <Select
                            value={editingSubmission.status}
                            onValueChange={handleStatusChange}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="DRAFT">Draft</SelectItem>
                              <SelectItem value="SUBMITTED">
                                Submitted
                              </SelectItem>
                              <SelectItem value="APPROVED">Approved</SelectItem>
                              <SelectItem value="REJECTED">Rejected</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="edit-created-by">Created By</Label>
                        <Input
                          id="edit-created-by"
                          value={editingSubmission.createdBy || ''}
                          onChange={(e) =>
                            setEditingSubmission({
                              ...editingSubmission,
                              createdBy: e.target.value,
                            })
                          }
                          placeholder="Created by"
                        />
                      </div>
                      <div>
                        <Label>Form Data (JSON)</Label>
                        <Textarea
                          value={JSON.stringify(
                            editingSubmission.formData,
                            null,
                            2
                          )}
                          onChange={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value);
                              setEditingSubmission({
                                ...editingSubmission,
                                formData: parsed,
                              });
                            } catch (error) {
                              // Invalid JSON, don't update
                            }
                          }}
                          rows={6}
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-600">
                      {submission.formData?.quantityRequested && (
                        <p>
                          <strong>Quantity:</strong>{' '}
                          {submission.formData.quantityRequested}
                        </p>
                      )}
                      {submission.formData?.unitPrice && (
                        <p>
                          <strong>Unit Price:</strong> $
                          {submission.formData.unitPrice}
                        </p>
                      )}
                      {submission.formData?.amount && (
                        <p>
                          <strong>Total Amount:</strong> $
                          {submission.formData.amount}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
