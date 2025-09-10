import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Edit, Trash2, Plus, Search } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import VendorFormModal from "./VendorFormModal";

interface VendorAdminProps {}

export default function VendorAdmin({}: VendorAdminProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filter states
  const [filters, setFilters] = useState({
    q: "",
    approved: "all",
    evaluated: "all",
  });
  const [page, setPage] = useState(1);
  const limit = 10;

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [vendorToEdit, setVendorToEdit] = useState<any>(null);

  // Fetch vendors with filters and pagination
  const { data: vendorData, isLoading } = useQuery({
    queryKey: ["/api/vendors", filters, page, limit],
    queryFn: () => {
      const params = new URLSearchParams({
        q: filters.q,
        approved: filters.approved,
        evaluated: filters.evaluated,
        page: page.toString(),
        limit: limit.toString(),
      });
      return apiRequest(`/api/vendors?${params}`);
    },
  });

  const vendors = vendorData?.data || [];
  const total = vendorData?.total || 0;
  const totalPages = Math.ceil(total / limit);

  // Delete vendor mutation
  const deleteVendorMutation = useMutation({
    mutationFn: (vendorId: number) => apiRequest(`/api/vendors/${vendorId}`, {
      method: "DELETE",
    }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Vendor deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete vendor",
        variant: "destructive",
      });
    },
  });

  const handleFilterChange = (key: string, value: string) => {
    setPage(1); // Reset to first page when filters change
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleEdit = (vendor: any) => {
    setVendorToEdit(vendor);
    setModalOpen(true);
  };

  const handleNew = () => {
    setVendorToEdit(null);
    setModalOpen(true);
  };

  const handleDelete = async (vendor: any) => {
    if (!window.confirm(`Delete vendor "${vendor.name}"? This action cannot be undone.`)) {
      return;
    }
    deleteVendorMutation.mutate(vendor.id);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setVendorToEdit(null);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
  };

  const formatAddress = (address: any) => {
    if (!address) return "—";
    const parts = [address.street, address.city, address.state, address.zip].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "—";
  };

  return (
    <div className="p-6 space-y-6" data-testid="container-vendor-admin">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span data-testid="text-vendor-admin-title">Vendor Management</span>
            <Button onClick={handleNew} data-testid="button-new-vendor">
              <Plus className="h-4 w-4 mr-2" />
              New Vendor
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4" data-testid="container-vendor-filters">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search vendors..."
                  value={filters.q}
                  onChange={(e) => handleFilterChange("q", e.target.value)}
                  className="pl-8"
                  data-testid="input-vendor-search"
                />
              </div>
            </div>
            
            <div className="flex flex-col space-y-1">
              <Label id="label-approved" className="text-sm font-medium" data-testid="label-vendor-approved">
                Approved
              </Label>
              <Select
                value={filters.approved}
                onValueChange={(value) => handleFilterChange("approved", value)}
              >
                <SelectTrigger className="w-[150px]" aria-labelledby="label-approved" data-testid="select-vendor-approved">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col space-y-1">
              <Label id="label-evaluated" className="text-sm font-medium" data-testid="label-vendor-evaluated">
                Evaluated
              </Label>
              <Select
                value={filters.evaluated}
                onValueChange={(value) => handleFilterChange("evaluated", value)}
              >
                <SelectTrigger className="w-[150px]" aria-labelledby="label-evaluated" data-testid="select-vendor-evaluated">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Loading State */}
          {isLoading ? (
            <div className="text-center py-8" data-testid="text-vendor-loading">
              Loading vendors...
            </div>
          ) : vendors.length === 0 ? (
            <div className="text-center py-8" data-testid="text-vendor-empty">
              <p className="text-muted-foreground">No vendors found.</p>
              <p className="text-sm text-muted-foreground">Try adjusting your search filters or add a new vendor.</p>
            </div>
          ) : (
            <>
              {/* Vendors Table */}
              <div className="rounded-md border" data-testid="table-vendors">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendors.map((vendor: any) => (
                      <TableRow key={vendor.id} data-testid={`row-vendor-${vendor.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium" data-testid={`text-vendor-name-${vendor.id}`}>
                              {vendor.name}
                            </div>
                            {vendor.website && (
                              <div className="text-sm text-muted-foreground truncate">
                                {vendor.website}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {vendor.contactPerson && (
                              <div className="text-sm" data-testid={`text-vendor-contact-${vendor.id}`}>
                                {vendor.contactPerson}
                              </div>
                            )}
                            {vendor.email && (
                              <div className="text-sm text-muted-foreground">
                                {vendor.email}
                              </div>
                            )}
                            {vendor.phone && (
                              <div className="text-sm text-muted-foreground">
                                {vendor.phone}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm" data-testid={`text-vendor-address-${vendor.id}`}>
                            {formatAddress(vendor.address)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge 
                              variant={vendor.approved ? "default" : "secondary"}
                              data-testid={`badge-vendor-approved-${vendor.id}`}
                            >
                              {vendor.approved ? "Approved" : "Not Approved"}
                            </Badge>
                            <Badge 
                              variant={vendor.evaluated ? "default" : "secondary"}
                              data-testid={`badge-vendor-evaluated-${vendor.id}`}
                            >
                              {vendor.evaluated ? "Evaluated" : "Not Evaluated"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm" data-testid={`text-vendor-created-${vendor.id}`}>
                            {vendor.createdAt ? format(new Date(vendor.createdAt), "MMM d, yyyy") : "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(vendor)}
                              data-testid={`button-edit-vendor-${vendor.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(vendor)}
                              disabled={deleteVendorMutation.isPending}
                              data-testid={`button-delete-vendor-${vendor.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground" data-testid="text-vendor-pagination-info">
                    Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} vendors
                  </div>
                  <Pagination data-testid="pagination-vendors">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setPage(Math.max(1, page - 1))}
                          className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          data-testid="button-vendor-previous"
                        />
                      </PaginationItem>
                      
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                        <PaginationItem key={pageNum}>
                          <PaginationLink
                            onClick={() => setPage(pageNum)}
                            isActive={pageNum === page}
                            className="cursor-pointer"
                            data-testid={`button-vendor-page-${pageNum}`}
                          >
                            {pageNum}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setPage(Math.min(totalPages, page + 1))}
                          className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          data-testid="button-vendor-next"
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Vendor Form Modal */}
      <VendorFormModal
        open={modalOpen}
        onClose={handleModalClose}
        vendorToEdit={vendorToEdit}
        onSaved={handleRefresh}
      />
    </div>
  );
}