import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Download,
  Edit,
  CheckCircle,
  AlertCircle,
  Clock,
  History,
} from 'lucide-react';
import type { ControlledDocument } from '@shared/schema';

export default function MasterDocumentRegister() {
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Fetch controlled documents
  const { data: documents = [], isLoading } = useQuery<ControlledDocument[]>({
    queryKey: ['/api/controlled-documents'],
  });

  // Fetch current user session for role-based access
  const { data: session } = useQuery<{ username: string; role: string }>({
    queryKey: ['/api/auth/session'],
  });

  const canCreateEdit = session?.role === 'ADMIN' || session?.role === 'OWNER';
  const canApprove = session?.username === 'lauriet';

  // Filter documents
  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      searchQuery === '' ||
      doc.documentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.documentNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.description && doc.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesDepartment = departmentFilter === 'all' || doc.department === departmentFilter;
    const matchesType = typeFilter === 'all' || doc.documentType === typeFilter;
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;

    return matchesSearch && matchesDepartment && matchesType && matchesStatus;
  });

  // Get unique departments and types for filters
  const departments = ['all', ...Array.from(new Set(documents.map((d) => d.department)))];
  const documentTypes = ['all', ...Array.from(new Set(documents.map((d) => d.documentType)))];

  // Check if document is expired
  const isExpired = (doc: ControlledDocument) => {
    if (!doc.expirationDate || doc.status !== 'approved') return false;
    return new Date(doc.expirationDate) < new Date();
  };

  // Check if document is expiring soon (within 30 days)
  const isExpiringSoon = (doc: ControlledDocument) => {
    if (!doc.expirationDate || doc.status !== 'approved') return false;
    const today = new Date();
    const expDate = new Date(doc.expirationDate);
    const daysUntilExpiration = Math.floor((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiration > 0 && daysUntilExpiration <= 30;
  };

  const getStatusBadge = (doc: ControlledDocument) => {
    if (isExpired(doc)) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Expired
        </Badge>
      );
    }

    if (isExpiringSoon(doc)) {
      return (
        <Badge variant="outline" className="flex items-center gap-1 border-yellow-500 text-yellow-700">
          <Clock className="h-3 w-3" />
          Expiring Soon
        </Badge>
      );
    }

    switch (doc.status) {
      case 'approved':
        return (
          <Badge variant="default" className="flex items-center gap-1 bg-green-600">
            <CheckCircle className="h-3 w-3" />
            Approved
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="flex items-center gap-1 border-blue-500 text-blue-700">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      case 'draft':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Edit className="h-3 w-3" />
            Draft
          </Badge>
        );
      default:
        return <Badge variant="outline">{doc.status}</Badge>;
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto ml-16">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <FileText className="h-8 w-8 text-blue-600" />
                Master Document Register
              </h1>
              <p className="text-gray-600 mt-1">
                Controlled documents for P1 and P2 operations
              </p>
            </div>
            {canCreateEdit && (
              <Button
                className="flex items-center gap-2"
                data-testid="button-create-document"
              >
                <Plus className="h-4 w-4" />
                New Document
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="h-5 w-5" />
              Search & Filter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-documents"
                />
              </div>

              {/* Department Filter */}
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger data-testid="select-department-filter">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept === 'all' ? 'All Departments' : dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Type Filter */}
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger data-testid="select-type-filter">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  {documentTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type === 'all' ? 'All Types' : type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-status-filter">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Documents Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Controlled Documents ({filteredDocuments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading documents...</div>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No documents found matching your criteria
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Doc #</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Effective Date</TableHead>
                      <TableHead>Expiration Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocuments.map((doc) => (
                      <TableRow
                        key={doc.id}
                        className={isExpired(doc) ? 'bg-red-50' : ''}
                        data-testid={`row-document-${doc.id}`}
                      >
                        <TableCell className="font-medium">{doc.documentNumber}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{doc.documentName}</div>
                            {doc.description && (
                              <div className="text-xs text-gray-500 truncate max-w-xs">
                                {doc.description}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{doc.documentType}</TableCell>
                        <TableCell>{doc.department}</TableCell>
                        <TableCell className="font-mono text-sm">{doc.currentVersion}</TableCell>
                        <TableCell>{getStatusBadge(doc)}</TableCell>
                        <TableCell>{formatDate(doc.effectiveDate)}</TableCell>
                        <TableCell>
                          <div>
                            {formatDate(doc.expirationDate)}
                            {doc.retentionLength && (
                              <div className="text-xs text-gray-500">
                                Retention: {doc.retentionLength}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {doc.filePath && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                title="Download"
                                data-testid={`button-download-${doc.id}`}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              title="Version History"
                              data-testid={`button-history-${doc.id}`}
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            {canCreateEdit && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                title="Edit"
                                data-testid={`button-edit-${doc.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                            {canApprove && doc.status === 'pending' && (
                              <Button
                                size="sm"
                                variant="default"
                                className="bg-green-600 hover:bg-green-700"
                                title="Approve"
                                data-testid={`button-approve-${doc.id}`}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
