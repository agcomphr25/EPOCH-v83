import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Building2, 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Globe, 
  FileText,
  Users,
  MapPin,
  Star,
  Filter,
  RefreshCw,
  Eye
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import VendorFormModal from '@/components/VendorFormModal';

// Types matching the backend schema
interface Vendor {
  id: number;
  name: string;
  website?: string;
  notes?: string;
  status: string;
  approvalStatus: string;
  totalScore: number;
  lastScoredAt?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface VendorContact {
  id: number;
  vendorId: number;
  contactSlot: number;
  firstName: string;
  lastName: string;
  role?: string;
  isPrimary: boolean;
  notes?: string;
  isActive: boolean;
}

interface VendorAddress {
  id: number;
  vendorId: number;
  addressSlot: number;
  type: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  isPrimary: boolean;
  isActive: boolean;
}

interface VendorDocument {
  id: number;
  vendorId: number;
  documentName: string;
  documentType?: string;
  filePath?: string;
  fileSize?: number;
  description?: string;
  isActive: boolean;
  createdAt: string;
}

interface VendorWithDetails extends Vendor {
  contacts: VendorContact[];
  addresses: VendorAddress[];
  documents: VendorDocument[];
}

export default function VendorManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [approvalFilter, setApprovalFilter] = useState('all');
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [isViewDetailsOpen, setIsViewDetailsOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isVendorFormOpen, setIsVendorFormOpen] = useState(false);
  const [vendorFormMode, setVendorFormMode] = useState<'create' | 'edit'>('create');
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch vendors
  const { data: vendors = [], isLoading, error, refetch } = useQuery({
    queryKey: ['/api/vendors'],
    queryFn: async () => {
      const response = await fetch('/api/vendors');
      if (!response.ok) throw new Error('Failed to fetch vendors');
      return response.json();
    },
  });

  // Fetch vendor details for selected vendor
  const { data: vendorDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['/api/vendors', selectedVendor?.id, 'details'],
    queryFn: async () => {
      const response = await fetch(`/api/vendors/${selectedVendor!.id}/details`);
      if (!response.ok) throw new Error('Failed to fetch vendor details');
      return response.json();
    },
    enabled: !!selectedVendor?.id,
  });

  // Delete vendor mutation
  const deleteVendorMutation = useMutation({
    mutationFn: async (vendorId: number) => {
      return apiRequest(`/api/vendors/${vendorId}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendors'] });
      toast({
        title: "Success",
        description: "Vendor deleted successfully",
      });
      setIsDeleteConfirmOpen(false);
      setSelectedVendor(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete vendor",
        variant: "destructive",
      });
    },
  });

  // Filter vendors based on search and filters
  const filteredVendors = vendors.filter((vendor: Vendor) => {
    const matchesSearch = vendor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (vendor.website && vendor.website.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || vendor.status === statusFilter;
    const matchesApproval = approvalFilter === 'all' || vendor.approvalStatus === approvalFilter;
    return matchesSearch && matchesStatus && matchesApproval;
  });

  const getStatusBadge = (status: string) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      suspended: 'bg-red-100 text-red-800',
    };
    return (
      <Badge className={colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getApprovalBadge = (approval: string) => {
    const colors = {
      approved: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return (
      <Badge className={colors[approval as keyof typeof colors] || 'bg-gray-100 text-gray-800'}>
        {approval.charAt(0).toUpperCase() + approval.slice(1)}
      </Badge>
    );
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  const handleViewDetails = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setIsViewDetailsOpen(true);
  };

  const handleDeleteVendor = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setIsDeleteConfirmOpen(true);
  };

  const handleAddVendor = () => {
    setSelectedVendor(null);
    setVendorFormMode('create');
    setIsVendorFormOpen(true);
  };

  const handleEditVendor = async (vendor: Vendor) => {
    try {
      // Fetch full vendor details including contacts and addresses
      const response = await fetch(`/api/vendors/${vendor.id}/details`);
      if (!response.ok) throw new Error('Failed to fetch vendor details');
      
      const vendorDetails = await response.json();
      setSelectedVendor(vendorDetails);
      setVendorFormMode('edit');
      setIsVendorFormOpen(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load vendor details for editing",
        variant: "destructive",
      });
    }
  };

  const handleCloseVendorForm = () => {
    setIsVendorFormOpen(false);
    setSelectedVendor(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-red-600">
            Error loading vendors. Please try again.
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="ml-2"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="vendor-management-page">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" data-testid="page-title">Vendor Management</h1>
          <p className="text-muted-foreground">
            Manage vendors, contacts, and supplier relationships
          </p>
        </div>
        <Button onClick={handleAddVendor} data-testid="button-add-vendor">
          <Plus className="h-4 w-4 mr-2" />
          Add Vendor
        </Button>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search vendors..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
                data-testid="input-search-vendors"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
            <Select value={approvalFilter} onValueChange={setApprovalFilter}>
              <SelectTrigger className="w-full sm:w-40" data-testid="select-approval-filter">
                <SelectValue placeholder="Approval" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Approval</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Vendors Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Vendors ({filteredVendors.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor Name</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Last Scored</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVendors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No vendors found
                  </TableCell>
                </TableRow>
              ) : (
                filteredVendors.map((vendor: Vendor) => (
                  <TableRow key={vendor.id} data-testid={`row-vendor-${vendor.id}`}>
                    <TableCell>
                      <div className="font-medium" data-testid={`text-vendor-name-${vendor.id}`}>
                        {vendor.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {vendor.website ? (
                        <a
                          href={vendor.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline flex items-center gap-1"
                          data-testid={`link-vendor-website-${vendor.id}`}
                        >
                          <Globe className="h-3 w-3" />
                          Visit
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell data-testid={`status-vendor-${vendor.id}`}>
                      {getStatusBadge(vendor.status)}
                    </TableCell>
                    <TableCell data-testid={`approval-vendor-${vendor.id}`}>
                      {getApprovalBadge(vendor.approvalStatus)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-yellow-500" />
                        <span data-testid={`score-vendor-${vendor.id}`}>
                          {vendor.totalScore?.toFixed(1) || '0.0'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell data-testid={`last-scored-vendor-${vendor.id}`}>
                      {formatDate(vendor.lastScoredAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(vendor)}
                          data-testid={`button-view-vendor-${vendor.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditVendor(vendor)}
                          data-testid={`button-edit-vendor-${vendor.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteVendor(vendor)}
                          className="text-red-600 hover:text-red-700"
                          data-testid={`button-delete-vendor-${vendor.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Vendor Details Modal */}
      <Dialog open={isViewDetailsOpen} onOpenChange={setIsViewDetailsOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Vendor Details - {selectedVendor?.name}
            </DialogTitle>
          </DialogHeader>
          {isLoadingDetails ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            vendorDetails && (
              <div className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <div>{getStatusBadge(vendorDetails.status)}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Approval</label>
                    <div>{getApprovalBadge(vendorDetails.approvalStatus)}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Website</label>
                    <div>
                      {vendorDetails.website ? (
                        <a
                          href={vendorDetails.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {vendorDetails.website}
                        </a>
                      ) : (
                        'Not provided'
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Score</label>
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 text-yellow-500" />
                      {vendorDetails.totalScore?.toFixed(1) || '0.0'}
                    </div>
                  </div>
                </div>

                {/* Contacts */}
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Contacts ({vendorDetails.contacts?.length || 0}/3)
                  </h3>
                  {vendorDetails.contacts?.length > 0 ? (
                    <div className="grid gap-3">
                      {vendorDetails.contacts.map((contact: VendorContact) => (
                        <Card key={contact.id} className="p-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-medium">
                                {contact.firstName} {contact.lastName}
                                {contact.isPrimary && (
                                  <Badge className="ml-2 bg-blue-100 text-blue-800">Primary</Badge>
                                )}
                              </div>
                              {contact.role && (
                                <div className="text-sm text-muted-foreground">{contact.role}</div>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No contacts added</p>
                  )}
                </div>

                {/* Addresses */}
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Addresses ({vendorDetails.addresses?.length || 0}/2)
                  </h3>
                  {vendorDetails.addresses?.length > 0 ? (
                    <div className="grid gap-3">
                      {vendorDetails.addresses.map((address: VendorAddress) => (
                        <Card key={address.id} className="p-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-medium capitalize">
                                {address.type} Address
                                {address.isPrimary && (
                                  <Badge className="ml-2 bg-blue-100 text-blue-800">Primary</Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {address.street1}
                                {address.street2 && <div>{address.street2}</div>}
                                <div>{address.city}, {address.state} {address.zipCode}</div>
                                <div>{address.country}</div>
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No addresses added</p>
                  )}
                </div>

                {/* Documents */}
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Documents ({vendorDetails.documents?.length || 0})
                  </h3>
                  {vendorDetails.documents?.length > 0 ? (
                    <div className="grid gap-2">
                      {vendorDetails.documents.map((document: VendorDocument) => (
                        <div key={document.id} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <div className="font-medium">{document.documentName}</div>
                            {document.documentType && (
                              <div className="text-sm text-muted-foreground">{document.documentType}</div>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {formatDate(document.createdAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No documents uploaded</p>
                  )}
                </div>

                {/* Notes */}
                {vendorDetails.notes && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Notes</label>
                    <p className="mt-1 text-sm">{vendorDetails.notes}</p>
                  </div>
                )}
              </div>
            )
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Vendor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>Are you sure you want to delete vendor "{selectedVendor?.name}"?</p>
            <p className="text-sm text-muted-foreground">
              This action cannot be undone and will remove all associated contacts, addresses, and documents.
            </p>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => setIsDeleteConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => selectedVendor && deleteVendorMutation.mutate(selectedVendor.id)}
                disabled={deleteVendorMutation.isPending}
              >
                {deleteVendorMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vendor Form Modal */}
      <VendorFormModal
        isOpen={isVendorFormOpen}
        onClose={handleCloseVendorForm}
        vendor={selectedVendor}
        mode={vendorFormMode}
      />
    </div>
  );
}