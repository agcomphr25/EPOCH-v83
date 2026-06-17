import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Package, 
  Clock, 
  CheckCircle, 
  XCircle, 
  ShoppingCart, 
  Truck, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Copy,
  ExternalLink,
  Building2,
  Globe,
  FileText,
  Users,
  Eye,
  Link as LinkIcon,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type InventoryItem = {
  id: number;
  agPartNumber: string;
  name: string;
  source?: string | null;
  vendorName?: string | null;
  vendorId?: number | null;
  currentBalance?: number;
  minStock?: number;
  maxStock?: number;
  usageUnit?: string;
};

type Department = {
  id: number;
  name: string;
};

type Vendor = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  website?: string;
};

type VendorPO = {
  id: number;
  poNumber?: string | null;
  vendorId: number;
  vendorName?: string | null;
  status: string;
  productionLine?: string | null;
  orderDate?: string | null;
  expectedDeliveryDate?: string | null;
  totalCost?: number | null;
};

type PartsRequest = {
  id: number;
  agPartNumber: string;
  partNumber: string;
  partName: string;
  requestedBy: string;
  requestedForEmployeeId?: number | null;
  requestedForDisplayName?: string | null;
  department: string;
  departmentId: number;
  quantity: number;
  urgency: string;
  supplier?: string;
  estimatedCost?: number;
  reason: string;
  status: string;
  requestDate: string;
  approvedBy?: string;
  approvedDate?: string;
  orderDate?: string;
  expectedDelivery?: string;
  actualDelivery?: string;
  deliveredToDepartment?: string;
  receivedByDepartment?: string;
  vendorId?: number;
  vendorPoId?: number | null;
  orderMethod?: 'PO' | 'WEBSITE';
  vendorPartNumber?: string;
  productUrl?: string;
  notes?: string;
  inventoryItem?: InventoryItem;
  department_details?: Department;
};

type VendorGroup = {
  key: string;
  vendorId: number | null;
  vendorName: string;
  orderMethod: string | null;
  websiteUrl: string | null;
  requests: PartsRequest[];
  totalQuantity: number;
  totalEstimatedCost: number;
};

type ConsolidatedPart = {
  partNumber: string;
  partName: string;
  totalQuantity: number;
  highestUrgency: string;
  departmentBreakdown: { department: string; quantity: number; urgency: string }[];
  requests: PartsRequest[];
  inventoryItem?: InventoryItem;
  currentBalance?: number;
};

export default function ConsolidatedNeedsListPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<PartsRequest | null>(null);
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'order' | 'receive' | 'deliver'>('approve');
  const [actionNotes, setActionNotes] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set());
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());
  const [mainViewTab, setMainViewTab] = useState<'by-status' | 'by-vendor'>('by-vendor');
  const [vendorFilterTab, setVendorFilterTab] = useState<'all' | 'po' | 'website'>('all');
  const [selectedVendorRequests, setSelectedVendorRequests] = useState<Set<number>>(new Set());
  const [isVendorAssignDialogOpen, setIsVendorAssignDialogOpen] = useState(false);
  const [isBulkOrderDialogOpen, setIsBulkOrderDialogOpen] = useState(false);
  const [bulkExpectedDelivery, setBulkExpectedDelivery] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [selectedOrderMethod, setSelectedOrderMethod] = useState<'PO' | 'WEBSITE'>('PO');
  const [batchQuantities, setBatchQuantities] = useState<Record<number, number>>({});
  const [batchNotes, setBatchNotes] = useState('');
  const [batchPurchasingCategory, setBatchPurchasingCategory] = useState<'P1' | 'P2' | 'GENERAL' | 'R_AND_D'>('GENERAL');
  const [batchExpectedDelivery, setBatchExpectedDelivery] = useState('');
  const [batchShipVia, setBatchShipVia] = useState('');
  const [isCreateBatchDialogOpen, setIsCreateBatchDialogOpen] = useState(false);
  const [batchVendorGroup, setBatchVendorGroup] = useState<VendorGroup | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [detailRequest, setDetailRequest] = useState<PartsRequest | null>(null);
  const [linkPoRequest, setLinkPoRequest] = useState<PartsRequest | null>(null);
  const [selectedVendorPoId, setSelectedVendorPoId] = useState('');
  const [linkPoCreateLine, setLinkPoCreateLine] = useState(true);
  const [linkPoQuantity, setLinkPoQuantity] = useState('');
  const [linkPoUnitPrice, setLinkPoUnitPrice] = useState('');
  const [linkPoNotes, setLinkPoNotes] = useState('');

  // Get current user for approval tracking
  const { data: user } = useQuery<{ username: string; firstName: string; lastName: string }>({
    queryKey: ['/api/auth/session'],
  });

  // Get all parts requests
  const { data: allRequests = [], isLoading } = useQuery<PartsRequest[]>({
    queryKey: ['/api/inventory/parts-requests'],
  });

  // Get all vendors (API returns paginated result with data property)
  const { data: vendorsResponse } = useQuery<{ data: Vendor[]; total: number; page: number; pageSize: number }>({
    queryKey: ['/api/vendors'],
  });
  const vendors = vendorsResponse?.data ?? [];

  const { data: vendorPOsResponse } = useQuery<{ data: VendorPO[]; total: number; page: number; pageSize: number }>({
    queryKey: ['/api/vendor-pos', { pageSize: 200, status: 'any', archived: 'false' }],
    queryFn: () => apiRequest('/api/vendor-pos?pageSize=200&status=any&archived=false'),
  });
  const vendorPOs = vendorPOsResponse?.data ?? [];

  // Update parts request mutation
  const updateRequestMutation = useMutation({
    mutationFn: async (data: { id: number; updates: Partial<PartsRequest> }) => {
      return apiRequest(`/api/inventory/parts-requests/${data.id}`, {
        method: 'PUT',
        body: JSON.stringify(data.updates),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/parts-requests'] });
      toast({
        title: 'Success',
        description: 'Request updated successfully.',
      });
      setIsActionDialogOpen(false);
      setSelectedRequest(null);
      setActionNotes('');
      setExpectedDeliveryDate('');
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update request. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: async (data: { requestIds: number[]; updates: Record<string, unknown> }) => {
      return apiRequest('/api/inventory/parts-requests/bulk', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (response: { success: boolean; updatedCount: number; skippedCount?: number; message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/parts-requests'] });
      
      if (response.skippedCount && response.skippedCount > 0) {
        toast({
          title: 'Partially Updated',
          description: response.message || `Updated ${response.updatedCount} requests. Some were skipped due to invalid status.`,
        });
      } else {
        toast({
          title: 'Success',
          description: response.message || `Successfully updated ${response.updatedCount} requests.`,
        });
      }
      
      setSelectedVendorRequests(new Set());
      setIsVendorAssignDialogOpen(false);
      setIsBulkOrderDialogOpen(false);
      setBulkExpectedDelivery('');
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update requests. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Create Vendor PO draft mutation
  const createBatchMutation = useMutation({
    mutationFn: async (data: {
      requestIds: number[];
      purchasingCategory: 'P1' | 'P2' | 'GENERAL' | 'R_AND_D';
      quantities: Record<number, number>;
      expectedDeliveryDate?: string | null;
      shipVia?: string | null;
      notes?: string;
    }) => {
      return apiRequest('/api/inventory/parts-requests/create-vendor-po-draft', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/parts-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast({
        title: 'Vendor PO Draft Created',
        description: result?.vendorPO?.id
          ? `Draft Vendor PO #${result.vendorPO.id} was created. RFQ and PO numbers will follow the existing workflow.`
          : 'Selected parts were linked to a draft Vendor PO.',
      });
      setIsCreateBatchDialogOpen(false);
      setBatchVendorGroup(null);
      setBatchQuantities({});
      setBatchNotes('');
      setBatchExpectedDelivery('');
      setBatchShipVia('');
      setSelectedVendorRequests(new Set());
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to create Vendor PO draft.',
        variant: 'destructive',
      });
    },
  });

  const linkVendorPoMutation = useMutation({
    mutationFn: async (data: {
      requestId: number;
      vendorPoId: number;
      createLineItem: boolean;
      quantity?: number;
      unitPrice?: number;
      notes?: string;
    }) => {
      return apiRequest(`/api/inventory/parts-requests/${data.requestId}/link-vendor-po`, {
        method: 'POST',
        body: JSON.stringify({
          vendorPoId: data.vendorPoId,
          createLineItem: data.createLineItem,
          quantity: data.quantity,
          unitPrice: data.unitPrice,
          notes: data.notes,
        }),
      });
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/parts-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      const lineMessage = result?.createdLine
        ? ` Created PO line #${result.createdLine.lineNumber}.`
        : result?.existingLine
          ? ` Matched PO line #${result.existingLine.lineNumber}.`
          : '';
      toast({
        title: 'Vendor PO Linked',
        description: `Parts request is now linked to Vendor PO #${result?.vendorPO?.id}.${lineMessage}`,
      });
      setLinkPoRequest(null);
      setSelectedVendorPoId('');
      setLinkPoCreateLine(true);
      setLinkPoQuantity('');
      setLinkPoUnitPrice('');
      setLinkPoNotes('');
    },
    onError: (error: any) => {
      toast({
        title: 'Could not link Vendor PO',
        description: error?.message || 'Failed to link this request to the selected Vendor PO.',
        variant: 'destructive',
      });
    },
  });

  // Reject request mutation
  const rejectRequestMutation = useMutation({
    mutationFn: async (data: { id: number; rejectedBy: string; reason: string }) => {
      return apiRequest(`/api/inventory/parts-requests/${data.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejectedBy: data.rejectedBy, reason: data.reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/parts-requests'] });
      toast({ title: 'Request Rejected', description: 'The parts request has been rejected.' });
      setIsActionDialogOpen(false);
      setSelectedRequest(null);
      setRejectionReason('');
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to reject request.', variant: 'destructive' });
    },
  });

  const openCreateBatchDialog = (vendorGroup: VendorGroup) => {
    if (vendorGroup.orderMethod === 'WEBSITE') {
      toast({
        title: 'Website Order',
        description: 'Website-order requests are visible here, but cannot be used to create a Vendor PO.',
        variant: 'destructive',
      });
      return;
    }
    if (!vendorGroup.vendorId) {
      toast({
        title: 'Vendor Required',
        description: 'Assign a vendor before creating a Vendor PO draft.',
        variant: 'destructive',
      });
      return;
    }
    const approvedRequests = vendorGroup.requests.filter(r => r.status === 'APPROVED' && !r.vendorPoId && r.orderMethod !== 'WEBSITE');
    if (approvedRequests.length === 0) {
      toast({
        title: 'No Approved Requests',
        description: 'There are no approved, PO-orderable requests in this vendor group.',
        variant: 'destructive',
      });
      return;
    }
    setBatchVendorGroup(vendorGroup);
    const defaultQuantities: Record<number, number> = {};
    approvedRequests.forEach(r => { defaultQuantities[r.id] = r.quantity; });
    setBatchQuantities(defaultQuantities);
    setIsCreateBatchDialogOpen(true);
  };

  const handleCreateBatch = () => {
    if (!batchVendorGroup) return;
    const requestIds = Object.keys(batchQuantities).map(Number).filter(id => batchQuantities[id] > 0);
    if (requestIds.length === 0) {
      toast({ title: 'No Items Selected', description: 'Set quantities for at least one item.', variant: 'destructive' });
      return;
    }
    createBatchMutation.mutate({
      requestIds,
      purchasingCategory: batchPurchasingCategory,
      quantities: batchQuantities,
      expectedDeliveryDate: batchExpectedDelivery || null,
      shipVia: batchShipVia || null,
      notes: batchNotes || undefined,
    });
  };

  // Consolidate requests by part number
  const consolidateByPart = (requests: PartsRequest[]): ConsolidatedPart[] => {
    const grouped = new Map<string, ConsolidatedPart>();

    requests.forEach((request) => {
      const key = request.partNumber;
      if (!grouped.has(key)) {
        grouped.set(key, {
          partNumber: request.partNumber,
          partName: request.partName,
          totalQuantity: 0,
          highestUrgency: 'LOW',
          departmentBreakdown: [],
          requests: [],
          inventoryItem: request.inventoryItem,
          currentBalance: request.inventoryItem?.currentBalance,
        });
      }

      const consolidated = grouped.get(key)!;
      consolidated.totalQuantity += request.quantity;
      consolidated.requests.push(request);

      // Track department breakdown
      const existingDept = consolidated.departmentBreakdown.find(
        (d) => d.department === request.department
      );
      if (existingDept) {
        existingDept.quantity += request.quantity;
      } else {
        consolidated.departmentBreakdown.push({
          department: request.department,
          quantity: request.quantity,
          urgency: request.urgency,
        });
      }

      // Update highest urgency
      const urgencyOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      const currentUrgency = urgencyOrder[consolidated.highestUrgency as keyof typeof urgencyOrder] || 1;
      const newUrgency = urgencyOrder[request.urgency as keyof typeof urgencyOrder] || 1;
      if (newUrgency > currentUrgency) {
        consolidated.highestUrgency = request.urgency;
      }
    });

    return Array.from(grouped.values());
  };

  // Filter and categorize requests
  const filteredRequests = useMemo(() => {
    return allRequests.filter((request) => {
      if (!searchTerm.trim()) return true;
      const search = searchTerm.toLowerCase();
      return (
        (request.partNumber && request.partNumber.toLowerCase().includes(search)) ||
        (request.partName && request.partName.toLowerCase().includes(search)) ||
        (request.department && request.department.toLowerCase().includes(search)) ||
        (request.requestedBy && request.requestedBy.toLowerCase().includes(search)) ||
        (request.requestedForDisplayName && request.requestedForDisplayName.toLowerCase().includes(search))
      );
    });
  }, [allRequests, searchTerm]);

  const pendingRequests = useMemo(() => consolidateByPart(filteredRequests.filter(r => r.status === 'PENDING')), [filteredRequests]);
  const approvedRequests = useMemo(() => consolidateByPart(filteredRequests.filter(r => r.status === 'APPROVED')), [filteredRequests]);
  const orderedRequests = useMemo(() => consolidateByPart(filteredRequests.filter(r => r.status === 'ORDERED')), [filteredRequests]);
  const receivedRequests = useMemo(() => consolidateByPart(filteredRequests.filter(r => r.status === 'RECEIVED')), [filteredRequests]);
  const deliveredRequests = useMemo(() => consolidateByPart(filteredRequests.filter(r => r.status === 'DELIVERED_TO_DEPT')), [filteredRequests]);

  const vendorMap = useMemo(() => {
    const map = new Map<number, Vendor>();
    vendors.forEach(v => map.set(v.id, v));
    return map;
  }, [vendors]);

  const normalizeVendorName = useCallback((value?: string | null) =>
    (value || '').toLowerCase().replace(/[^a-z0-9]/g, ''), []);

  const vendorNameMap = useMemo(() => {
    const map = new Map<string, Vendor>();
    vendors.forEach((vendor) => {
      const key = normalizeVendorName(vendor.name);
      if (key) map.set(key, vendor);
    });
    return map;
  }, [vendors, normalizeVendorName]);

  const getResolvedVendorForRequest = useCallback((request: PartsRequest): Vendor | null => {
    if (request.vendorId && vendorMap.has(request.vendorId)) {
      return vendorMap.get(request.vendorId)!;
    }
    if (request.inventoryItem?.vendorId && vendorMap.has(request.inventoryItem.vendorId)) {
      return vendorMap.get(request.inventoryItem.vendorId)!;
    }
    const sourceKey = normalizeVendorName(request.inventoryItem?.vendorName || request.inventoryItem?.source || request.supplier);
    if (sourceKey && vendorNameMap.has(sourceKey)) {
      return vendorNameMap.get(sourceKey)!;
    }
    for (const [vendorKey, vendor] of vendorNameMap) {
      if (sourceKey && (vendorKey.includes(sourceKey) || sourceKey.includes(vendorKey))) {
        return vendor;
      }
    }
    return null;
  }, [vendorMap, vendorNameMap, normalizeVendorName]);

  const getRequestVendorLabel = useCallback((request: PartsRequest): string => {
    return (
      request.inventoryItem?.vendorName ||
      request.inventoryItem?.source ||
      request.supplier ||
      ''
    ).trim();
  }, []);

  const openLinkPoDialog = (request: PartsRequest) => {
    setLinkPoRequest(request);
    setSelectedVendorPoId(request.vendorPoId ? String(request.vendorPoId) : '');
    setLinkPoCreateLine(true);
    setLinkPoQuantity(String(request.quantity || ''));
    setLinkPoUnitPrice(
      request.estimatedCost && request.quantity
        ? String(Number(request.estimatedCost / request.quantity).toFixed(2))
        : ''
    );
    setLinkPoNotes('');
  };

  const vendorGroups = useMemo(() => {
    const activeStatuses = ['PENDING', 'APPROVED', 'ORDERED', 'ORDERED_PARTIAL', 'RECEIVED', 'RECEIVED_PARTIAL', 'CANCEL_REQUESTED'];
    const activeRequests = filteredRequests.filter(r => activeStatuses.includes(r.status));

    const groups: Record<string, VendorGroup> = {};

    groups['unassigned'] = {
      key: 'unassigned',
      vendorId: null,
      vendorName: 'Unassigned',
      orderMethod: null,
      websiteUrl: null,
      requests: [],
      totalQuantity: 0,
      totalEstimatedCost: 0,
    };

    for (const request of activeRequests) {
      const vendor = getResolvedVendorForRequest(request);
      const vendorLabel = getRequestVendorLabel(request);

      if (vendor) {
        // Has a resolved vendor record — group under that vendor regardless of order method
        const key = `vendor-${vendor.id}`;
        if (!groups[key]) {
          groups[key] = {
            key,
            vendorId: vendor.id,
            vendorName: vendor.name,
            orderMethod: request.orderMethod || null,
            websiteUrl: vendor.website || null,
            requests: [],
            totalQuantity: 0,
            totalEstimatedCost: 0,
          };
        }
        groups[key].requests.push(request);
        groups[key].totalQuantity += request.quantity;
        groups[key].totalEstimatedCost += request.estimatedCost || 0;
      } else if (vendorLabel) {
        const sourceKey = normalizeVendorName(vendorLabel);
        const key = `source-${sourceKey || vendorLabel.toLowerCase()}`;
        if (!groups[key]) {
          groups[key] = {
            key,
            vendorId: null,
            vendorName: vendorLabel,
            orderMethod: request.orderMethod || null,
            websiteUrl: null,
            requests: [],
            totalQuantity: 0,
            totalEstimatedCost: 0,
          };
        }
        groups[key].requests.push(request);
        groups[key].totalQuantity += request.quantity;
        groups[key].totalEstimatedCost += request.estimatedCost || 0;
      } else if (request.orderMethod === 'WEBSITE') {
        // WEBSITE order with no resolved vendor — group by vendor text so buyers see per-site buckets.
        // Future improvement: once source_vendor_id FK exists, all WEBSITE items will resolve to a vendor and this fallback will be rarely needed.
        const vendorName = (request.inventoryItem?.vendorName || request.inventoryItem?.source || '').trim();
        const key = vendorName ? `website-${vendorName.toLowerCase()}` : 'website-unresolved';
        const groupName = vendorName || 'Website Orders';
        if (!groups[key]) {
          groups[key] = {
            key,
            vendorId: null,
            vendorName: groupName,
            orderMethod: 'WEBSITE',
            websiteUrl: null,
            requests: [],
            totalQuantity: 0,
            totalEstimatedCost: 0,
          };
        }
        groups[key].requests.push(request);
        groups[key].totalQuantity += request.quantity;
        groups[key].totalEstimatedCost += request.estimatedCost || 0;
      } else {
        groups['unassigned'].requests.push(request);
        groups['unassigned'].totalQuantity += request.quantity;
        groups['unassigned'].totalEstimatedCost += request.estimatedCost || 0;
      }
    }

    return Object.values(groups)
      .filter(g => g.requests.length > 0)
      .sort((a, b) => {
        if (a.vendorName === 'Unassigned') return 1;
        if (b.vendorName === 'Unassigned') return -1;
        if (a.vendorName === 'Website Orders') return 1;
        if (b.vendorName === 'Website Orders') return -1;
        return a.vendorName.localeCompare(b.vendorName);
      });
  }, [filteredRequests, getRequestVendorLabel, getResolvedVendorForRequest, normalizeVendorName]);

  const filteredVendorGroups = useMemo(() => {
    if (vendorFilterTab === 'po') {
      return vendorGroups.filter(g => g.orderMethod !== 'WEBSITE');
    } else if (vendorFilterTab === 'website') {
      return vendorGroups.filter(g => g.orderMethod === 'WEBSITE');
    }
    return vendorGroups;
  }, [vendorGroups, vendorFilterTab]);

  const linkRequestVendor = linkPoRequest ? getResolvedVendorForRequest(linkPoRequest) : null;
  const availableVendorPOsForLink = useMemo(() => {
    const vendorId = linkPoRequest?.vendorId ?? linkRequestVendor?.id ?? null;
    return vendorPOs
      .filter((po) => po.status !== 'Cancelled')
      .filter((po) => !vendorId || po.vendorId === vendorId)
      .sort((a, b) => {
        const aDate = a.orderDate || '';
        const bDate = b.orderDate || '';
        return bDate.localeCompare(aDate) || b.id - a.id;
      });
  }, [vendorPOs, linkPoRequest, linkRequestVendor]);

  const selectedVendorPO = availableVendorPOsForLink.find((po) => String(po.id) === selectedVendorPoId) ?? null;

  const toggleExpanded = (partNumber: string) => {
    setExpandedParts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(partNumber)) {
        newSet.delete(partNumber);
      } else {
        newSet.add(partNumber);
      }
      return newSet;
    });
  };

  const toggleVendorExpanded = (vendorKey: string) => {
    setExpandedVendors((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(vendorKey)) {
        newSet.delete(vendorKey);
      } else {
        newSet.add(vendorKey);
      }
      return newSet;
    });
  };

  const handleAction = (request: PartsRequest, action: typeof actionType) => {
    setSelectedRequest(request);
    setActionType(action);
    setIsActionDialogOpen(true);
  };

  const handleSubmitAction = () => {
    if (!selectedRequest || !user) return;

    const updates: Partial<PartsRequest> = {
      notes: actionNotes || selectedRequest.notes,
    };

    switch (actionType) {
      case 'approve':
        updates.status = 'APPROVED';
        updates.approvedBy = `${user.firstName} ${user.lastName}`;
        updates.approvedDate = new Date().toISOString();
        break;
      case 'reject':
        updates.status = 'REJECTED';
        updates.approvedBy = `${user.firstName} ${user.lastName}`;
        updates.approvedDate = new Date().toISOString();
        break;
      case 'order':
        updates.status = 'ORDERED';
        updates.orderDate = new Date().toISOString();
        if (expectedDeliveryDate) {
          updates.expectedDelivery = expectedDeliveryDate;
        }
        break;
      case 'receive':
        updates.status = 'RECEIVED';
        updates.actualDelivery = new Date().toISOString().split('T')[0];
        break;
      case 'deliver':
        updates.status = 'DELIVERED_TO_DEPT';
        updates.deliveredToDepartment = new Date().toISOString();
        updates.receivedByDepartment = actionNotes || 'Department Representative';
        break;
    }

    updateRequestMutation.mutate({ id: selectedRequest.id, updates });
  };

  const handleBulkVendorAssign = () => {
    if (selectedVendorRequests.size === 0) return;
    
    bulkUpdateMutation.mutate({
      requestIds: Array.from(selectedVendorRequests),
      updates: {
        vendorId: selectedVendorId ? parseInt(selectedVendorId) : null,
        orderMethod: selectedOrderMethod,
      },
    });
  };

  const handleBulkMarkOrdered = () => {
    if (selectedVendorRequests.size === 0) return;
    
    // Filter to only APPROVED requests (client-side safety measure, backend also validates)
    const allSelectedIds = Array.from(selectedVendorRequests);
    const approvedIds = allSelectedIds.filter(id => {
      const request = allRequests.find(r => r.id === id);
      return request?.status === 'APPROVED';
    });
    
    if (approvedIds.length === 0) {
      toast({
        title: 'No Approved Requests',
        description: 'Only approved requests can be marked as ordered. Please select approved items.',
        variant: 'destructive',
      });
      return;
    }
    
    if (approvedIds.length < allSelectedIds.length) {
      toast({
        title: 'Some Items Filtered',
        description: `${allSelectedIds.length - approvedIds.length} non-approved items were excluded. Ordering ${approvedIds.length} approved items.`,
      });
    }
    
    bulkUpdateMutation.mutate({
      requestIds: approvedIds,
      updates: {
        status: 'ORDERED',
        orderDate: new Date().toISOString(),
        expectedDelivery: bulkExpectedDelivery || null,
      },
    });
  };

  const handleLinkVendorPo = () => {
    if (!linkPoRequest || !selectedVendorPoId) return;
    const quantity = linkPoQuantity ? Number(linkPoQuantity) : null;
    const unitPrice = linkPoUnitPrice ? Number(linkPoUnitPrice) : null;
    linkVendorPoMutation.mutate({
      requestId: linkPoRequest.id,
      vendorPoId: Number(selectedVendorPoId),
      createLineItem: linkPoCreateLine,
      quantity: quantity !== null && Number.isFinite(quantity) ? quantity : undefined,
      unitPrice: unitPrice !== null && Number.isFinite(unitPrice) ? unitPrice : undefined,
      notes: linkPoNotes.trim() || undefined,
    });
  };

  const exportVendorCSV = (vendorGroup: VendorGroup) => {
    const headers = ['Part Number', 'Part Name', 'Vendor SKU', 'Quantity', 'Est. Cost', 'Department', 'Requested By', 'Requested For', 'Urgency', 'Status'];
    const rows = vendorGroup.requests.map(r => [
      r.partNumber,
      r.partName,
      r.vendorPartNumber || '',
      r.quantity.toString(),
      r.estimatedCost?.toFixed(2) || '',
      r.department,
      r.requestedBy,
      r.requestedForDisplayName || '',
      r.urgency,
      r.status,
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${vendorGroup.vendorName.replace(/\s+/g, '_')}_parts_order.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: 'CSV Downloaded',
      description: `Order list for ${vendorGroup.vendorName} has been downloaded.`,
    });
  };

  const copyOrderList = (vendorGroup: VendorGroup) => {
    const lines = vendorGroup.requests.map(r => 
      `${r.vendorPartNumber || r.partNumber}\t${r.partName}\t${r.quantity}`
    );
    const text = lines.join('\n');
    navigator.clipboard.writeText(text);
    
    toast({
      title: 'Copied to Clipboard',
      description: `Order list for ${vendorGroup.vendorName} copied. Paste into vendor website.`,
    });
  };

  const toggleRequestSelection = (requestId: number) => {
    setSelectedVendorRequests(prev => {
      const newSet = new Set(prev);
      if (newSet.has(requestId)) {
        newSet.delete(requestId);
      } else {
        newSet.add(requestId);
      }
      return newSet;
    });
  };

  const selectAllInVendor = (vendorGroup: VendorGroup) => {
    const approvedIds = vendorGroup.requests
      .filter(r => r.status === 'APPROVED' && r.orderMethod !== 'WEBSITE' && !r.vendorPoId)
      .map(r => r.id);
    setSelectedVendorRequests(new Set(approvedIds));
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: JSX.Element }> = {
      PENDING: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300', icon: <Clock className="w-3 h-3" /> },
      APPROVED: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300', icon: <CheckCircle className="w-3 h-3" /> },
      ORDERED: { color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300', icon: <ShoppingCart className="w-3 h-3" /> },
      ORDERED_PARTIAL: { color: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300', icon: <ShoppingCart className="w-3 h-3" /> },
      RECEIVED: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', icon: <Package className="w-3 h-3" /> },
      RECEIVED_PARTIAL: { color: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300', icon: <Package className="w-3 h-3" /> },
      DELIVERED_TO_DEPT: { color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300', icon: <Truck className="w-3 h-3" /> },
      REJECTED: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', icon: <XCircle className="w-3 h-3" /> },
      CANCEL_REQUESTED: { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300', icon: <AlertTriangle className="w-3 h-3" /> },
      CANCELED: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300', icon: <XCircle className="w-3 h-3" /> },
    };

    const config = statusConfig[status] || statusConfig.PENDING;
    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        {config.icon}
        {status.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const getUrgencyBadge = (urgency: string) => {
    const urgencyConfig: Record<string, { color: string; icon?: JSX.Element }> = {
      LOW: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
      MEDIUM: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
      HIGH: { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300', icon: <AlertTriangle className="w-3 h-3" /> },
      CRITICAL: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', icon: <AlertTriangle className="w-3 h-3" /> },
    };

    const config = urgencyConfig[urgency] || urgencyConfig.MEDIUM;
    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        {config.icon}
        {urgency}
      </Badge>
    );
  };

  const getOrderMethodBadge = (method: string | null) => {
    if (method === 'WEBSITE') {
      return (
        <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300 flex items-center gap-1">
          <Globe className="w-3 h-3" />
          Website
        </Badge>
      );
    }
    return (
      <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300 flex items-center gap-1">
        <FileText className="w-3 h-3" />
        PO
      </Badge>
    );
  };

  const renderConsolidatedTable = (consolidatedParts: ConsolidatedPart[], showActions: boolean = true) => {
    if (consolidatedParts.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No requests found.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {consolidatedParts.map((consolidated) => {
          const isExpanded = expandedParts.has(consolidated.partNumber);
          const isLowStock = consolidated.currentBalance !== undefined && 
                           consolidated.inventoryItem?.minStock !== undefined && 
                           consolidated.currentBalance < consolidated.inventoryItem.minStock;

          return (
            <div key={consolidated.partNumber} className="border rounded-lg dark:border-gray-700">
              {/* Consolidated Row */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex-1 grid grid-cols-6 gap-4">
                    <div className="col-span-2">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{consolidated.partName}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{consolidated.partNumber}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Total Quantity</div>
                      <div className="font-bold text-lg text-gray-900 dark:text-gray-100">
                        {consolidated.totalQuantity}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Departments</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {consolidated.departmentBreakdown.map((dept) => (
                          <Badge key={dept.department} variant="outline" className="text-xs">
                            {dept.department}: {dept.quantity}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Urgency</div>
                      <div className="mt-1">{getUrgencyBadge(consolidated.highestUrgency)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Current Stock</div>
                      <div className={`font-medium mt-1 ${isLowStock ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                        {consolidated.currentBalance ?? 'N/A'}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpanded(consolidated.partNumber)}
                    data-testid={`button-expand-${consolidated.partNumber}`}
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Expanded Individual Requests */}
              {isExpanded && (
                <div className="border-t dark:border-gray-700">
                  <table className="w-full">
                    <thead className="bg-gray-100 dark:bg-gray-900">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Department</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Requested By</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Requested For</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Qty</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Urgency</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Reason</th>
                        {showActions && <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                      {consolidated.requests.map((request) => (
                        <tr key={request.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{request.department}</td>
                          <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{request.requestedBy}</td>
                          <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{request.requestedForDisplayName || '—'}</td>
                          <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{request.quantity}</td>
                          <td className="px-4 py-2 text-sm">{getUrgencyBadge(request.urgency)}</td>
                          <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate">{request.reason}</td>
                          {showActions && (
                            <td className="px-4 py-2 text-sm text-right space-x-2">
                              {request.status === 'PENDING' && (
                                <>
                                  <Button size="sm" variant="default" onClick={() => handleAction(request, 'approve')} data-testid={`button-approve-${request.id}`}>
                                    Approve
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => handleAction(request, 'reject')} data-testid={`button-reject-${request.id}`}>
                                    Reject
                                  </Button>
                                </>
                              )}
                              {request.status === 'APPROVED' && (
                                <Button size="sm" variant="default" onClick={() => handleAction(request, 'order')} data-testid={`button-order-${request.id}`}>
                                  Mark Ordered
                                </Button>
                              )}
                              {request.status === 'ORDERED' && (
                                <Button size="sm" variant="default" onClick={() => handleAction(request, 'receive')} data-testid={`button-receive-${request.id}`}>
                                  Mark Received
                                </Button>
                              )}
                              {request.status === 'RECEIVED' && (
                                <Button size="sm" variant="default" onClick={() => handleAction(request, 'deliver')} data-testid={`button-deliver-${request.id}`}>
                                  Deliver to Dept
                                </Button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderVendorGroupedView = () => {
    if (isLoading) {
      return (
        <div className="text-center py-8">
          <p className="text-muted-foreground">Loading vendor groups...</p>
        </div>
      );
    }

    if (filteredVendorGroups.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No requests found.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Bulk Actions Bar */}
        {selectedVendorRequests.size > 0 && (
          <div className="sticky top-0 z-10 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{selectedVendorRequests.size} selected</Badge>
              <span className="text-sm text-muted-foreground">requests selected</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsVendorAssignDialogOpen(true)}
                data-testid="button-assign-vendor"
              >
                <Building2 className="w-4 h-4 mr-1" />
                Assign Vendor
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={() => setIsBulkOrderDialogOpen(true)}
                data-testid="button-bulk-mark-ordered"
                className="hidden"
              >
                <ShoppingCart className="w-4 h-4 mr-1" />
                Mark Ordered
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedVendorRequests(new Set())}
                data-testid="button-clear-selection"
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Vendor Filter Tabs */}
        <Tabs value={vendorFilterTab} onValueChange={(v) => setVendorFilterTab(v as typeof vendorFilterTab)}>
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-vendor-all">
              All Vendors ({vendorGroups.length})
            </TabsTrigger>
            <TabsTrigger value="po" data-testid="tab-vendor-po">
              <FileText className="w-4 h-4 mr-1" />
              PO Orders
            </TabsTrigger>
            <TabsTrigger value="website" data-testid="tab-vendor-website">
              <Globe className="w-4 h-4 mr-1" />
              Website Orders
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Vendor Cards */}
        {filteredVendorGroups.map((vendorGroup) => {
          const vendorKey = vendorGroup.key;
          const isExpanded = expandedVendors.has(vendorKey);
          const approvedCount = vendorGroup.requests.filter(r => r.status === 'APPROVED' && !r.vendorPoId && r.orderMethod !== 'WEBSITE').length;
          const hasHighUrgency = vendorGroup.requests.some(r => r.urgency === 'HIGH' || r.urgency === 'CRITICAL');
          const isWebsiteGroup = vendorGroup.orderMethod === 'WEBSITE';

          return (
            <Card key={vendorKey} className={`${hasHighUrgency ? 'border-orange-300 dark:border-orange-700' : ''}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                      {vendorGroup.orderMethod === 'WEBSITE' ? (
                        <Globe className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                      ) : vendorGroup.vendorId ? (
                        <Building2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      ) : (
                        <Users className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {vendorGroup.vendorName}
                        {getOrderMethodBadge(vendorGroup.orderMethod)}
                        {hasHighUrgency && (
                          <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Urgent
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {vendorGroup.requests.length} parts | {vendorGroup.totalQuantity} total units | 
                        {approvedCount > 0 && ` ${approvedCount} ready to order |`}
                        ${vendorGroup.totalEstimatedCost.toFixed(2)} est. total
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Quick Actions */}
                    {approvedCount > 0 && !isWebsiteGroup && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => openCreateBatchDialog(vendorGroup)}
                          data-testid={`button-create-batch-${vendorKey}`}
                        >
                          <ShoppingCart className="w-4 h-4 mr-1" />
                          Create Vendor PO Draft ({approvedCount})
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => selectAllInVendor(vendorGroup)}
                          data-testid={`button-select-all-${vendorKey}`}
                        >
                          Select All Ready
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleVendorExpanded(vendorKey)}
                      data-testid={`button-expand-vendor-${vendorKey}`}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent>
                  <table className="w-full">
                    <thead className="bg-gray-100 dark:bg-gray-900">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 w-10">
                          <Checkbox
                            checked={
                              vendorGroup.requests.filter(r => r.status === 'APPROVED' && r.orderMethod !== 'WEBSITE' && !r.vendorPoId).length > 0
                              && vendorGroup.requests.filter(r => r.status === 'APPROVED' && r.orderMethod !== 'WEBSITE' && !r.vendorPoId).every(r => selectedVendorRequests.has(r.id))
                            }
                            onCheckedChange={(checked) => {
                              const selectable = vendorGroup.requests.filter(r => r.status === 'APPROVED' && r.orderMethod !== 'WEBSITE' && !r.vendorPoId);
                              if (checked) {
                                setSelectedVendorRequests(new Set([
                                  ...Array.from(selectedVendorRequests),
                                  ...selectable.map(r => r.id)
                                ]));
                              } else {
                                const newSet = new Set(selectedVendorRequests);
                                selectable.forEach(r => newSet.delete(r.id));
                                setSelectedVendorRequests(newSet);
                              }
                            }}
                            data-testid={`checkbox-all-${vendorKey}`}
                          />
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Part</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Vendor SKU</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Qty</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Est. Cost</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Department</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Requested By</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Requested For</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Urgency</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                      {vendorGroup.requests.map((request) => {
                        const selectableForPo = request.status === 'APPROVED' && request.orderMethod !== 'WEBSITE' && !request.vendorPoId;
                        const canLinkExistingPo = !request.vendorPoId
                          && request.orderMethod !== 'WEBSITE'
                          && !['REJECTED', 'CANCELED', 'DELIVERED_TO_DEPT'].includes(request.status);
                        return (
                        <tr key={request.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-3 py-2">
                            <Checkbox
                              checked={selectedVendorRequests.has(request.id)}
                              onCheckedChange={() => toggleRequestSelection(request.id)}
                              disabled={!selectableForPo}
                              data-testid={`checkbox-request-${request.id}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setDetailRequest(request)}
                              className="text-left group"
                              data-testid={`button-view-part-${request.id}`}
                            >
                              <div className="font-medium text-sm text-gray-900 dark:text-gray-100 group-hover:text-blue-700 dark:group-hover:text-blue-300 group-hover:underline">
                                {request.partName}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{request.partNumber}</div>
                            </button>
                            {(getResolvedVendorForRequest(request) || request.inventoryItem?.vendorName || request.inventoryItem?.source) && (
                              <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                                Vendor: {getResolvedVendorForRequest(request)?.name || request.inventoryItem?.vendorName || request.inventoryItem?.source}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                            {request.vendorPartNumber || '-'}
                          </td>
                          <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">{request.quantity}</td>
                          <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                            {request.estimatedCost ? `$${request.estimatedCost.toFixed(2)}` : '-'}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100">{request.department}</td>
                          <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100">{request.requestedBy}</td>
                          <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100">{request.requestedForDisplayName || '—'}</td>
                          <td className="px-3 py-2">{getUrgencyBadge(request.urgency)}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              {getStatusBadge(request.status)}
                              {request.orderMethod === 'WEBSITE' && (
                                <Badge className="bg-teal-100 text-teal-800 w-fit">Website order</Badge>
                              )}
                              {request.vendorPoId && (
                                <Badge variant="outline" className="w-fit">Linked to Vendor PO #{request.vendorPoId}</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setDetailRequest(request)} data-testid={`button-details-${request.id}`}>
                              <Eye className="w-3 h-3 mr-1" />
                              View
                            </Button>
                            {canLinkExistingPo && (
                              <Button size="sm" variant="outline" onClick={() => openLinkPoDialog(request)} data-testid={`button-link-po-${request.id}`}>
                                <LinkIcon className="w-3 h-3 mr-1" />
                                Link PO
                              </Button>
                            )}
                            {selectableForPo && (
                              <Button size="sm" variant="default" onClick={() => toggleRequestSelection(request.id)} data-testid={`button-select-request-${request.id}`}>
                                {selectedVendorRequests.has(request.id) ? 'Selected' : 'Select'}
                              </Button>
                            )}
                            {request.status === 'ORDERED' && (
                              <Button size="sm" variant="outline" onClick={() => handleAction(request, 'receive')} data-testid={`button-receive-${request.id}`}>
                                Receive
                              </Button>
                            )}
                            {request.status === 'RECEIVED' && (
                              <Button size="sm" variant="outline" onClick={() => handleAction(request, 'deliver')} data-testid={`button-deliver-${request.id}`}>
                                Deliver
                              </Button>
                            )}
                            {request.productUrl && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => window.open(request.productUrl!, '_blank')}
                                data-testid={`button-product-${request.id}`}
                              >
                                <ExternalLink className="w-3 h-3" />
                              </Button>
                            )}
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Consolidated Parts Needs</h1>
        <p className="text-muted-foreground mt-1">
          Manage all parts requests across departments - grouped by part number or vendor
        </p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <Input
            placeholder="Search by part number, name, department, requester, or requested for..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search-requests"
          />
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{pendingRequests.length}</div>
            <p className="text-sm text-muted-foreground">Pending Parts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{approvedRequests.length}</div>
            <p className="text-sm text-muted-foreground">Approved Parts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{orderedRequests.length}</div>
            <p className="text-sm text-muted-foreground">Ordered Parts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{receivedRequests.length}</div>
            <p className="text-sm text-muted-foreground">Received Parts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{deliveredRequests.length}</div>
            <p className="text-sm text-muted-foreground">Delivered Parts</p>
          </CardContent>
        </Card>
      </div>

      {/* Main View Tabs */}
      <Tabs value={mainViewTab} onValueChange={(v) => {
        setMainViewTab(v as typeof mainViewTab);
        setVendorFilterTab('all');
      }}>
        <TabsList className="mb-4">
          <TabsTrigger value="by-status" data-testid="tab-by-status">
            <Package className="w-4 h-4 mr-2" />
            By Status
          </TabsTrigger>
          <TabsTrigger value="by-vendor" data-testid="tab-by-vendor">
            <Building2 className="w-4 h-4 mr-2" />
            By Vendor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="by-status">
          {/* Tabs for different request statuses */}
          <Card>
            <CardHeader>
              <CardTitle>Requests by Status (Consolidated by Part)</CardTitle>
              <CardDescription>
                Parts grouped by part number showing total quantities across departments
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Loading requests...</p>
                </div>
              ) : (
                <Tabs defaultValue="pending">
                  <TabsList>
                    <TabsTrigger value="pending" data-testid="tab-pending">
                      Pending ({pendingRequests.length})
                    </TabsTrigger>
                    <TabsTrigger value="approved" data-testid="tab-approved">
                      Approved ({approvedRequests.length})
                    </TabsTrigger>
                    <TabsTrigger value="ordered" data-testid="tab-ordered">
                      Ordered ({orderedRequests.length})
                    </TabsTrigger>
                    <TabsTrigger value="received" data-testid="tab-received">
                      Received ({receivedRequests.length})
                    </TabsTrigger>
                    <TabsTrigger value="delivered" data-testid="tab-delivered">
                      Delivered ({deliveredRequests.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="pending">
                    {renderConsolidatedTable(pendingRequests)}
                  </TabsContent>

                  <TabsContent value="approved">
                    {renderConsolidatedTable(approvedRequests)}
                  </TabsContent>

                  <TabsContent value="ordered">
                    {renderConsolidatedTable(orderedRequests)}
                  </TabsContent>

                  <TabsContent value="received">
                    {renderConsolidatedTable(receivedRequests)}
                  </TabsContent>

                  <TabsContent value="delivered">
                    {renderConsolidatedTable(deliveredRequests, false)}
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-vendor">
          <Card>
            <CardHeader>
              <CardTitle>Requests by Vendor</CardTitle>
              <CardDescription>
                Parts grouped by vendor for efficient ordering - select items to bulk order
              </CardDescription>
            </CardHeader>
            <CardContent>
              {renderVendorGroupedView()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Dialog */}
      <Dialog open={isActionDialogOpen} onOpenChange={setIsActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' && 'Approve Request'}
              {actionType === 'reject' && 'Reject Request'}
              {actionType === 'order' && 'Mark as Ordered'}
              {actionType === 'receive' && 'Mark as Received'}
              {actionType === 'deliver' && 'Deliver to Department'}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest?.partName} - {selectedRequest?.quantity} units for {selectedRequest?.department}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Request Details */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Requested By:</span>
                  <p className="font-medium">{selectedRequest?.requestedBy}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Requested For:</span>
                  <p className="font-medium">{selectedRequest?.requestedForDisplayName || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Urgency:</span>
                  <div className="mt-1">{selectedRequest && getUrgencyBadge(selectedRequest.urgency)}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Reason:</span>
                  <p className="font-medium">{selectedRequest?.reason}</p>
                </div>
              </div>
            </div>

            {/* Expected Delivery (for Order action) */}
            {actionType === 'order' && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Expected Delivery Date
                </label>
                <Input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  data-testid="input-expected-delivery"
                />
              </div>
            )}

            {/* Recipient (for Deliver action) */}
            {actionType === 'deliver' && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Received By (Department Representative)
                </label>
                <Input
                  placeholder="Enter name"
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  data-testid="input-received-by"
                />
              </div>
            )}

            {/* Notes */}
            {(actionType === 'approve' || actionType === 'reject') && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Notes {actionType === 'reject' && <span className="text-red-500">*</span>}
                </label>
                <Textarea
                  placeholder={actionType === 'reject' ? 'Please provide a reason for rejection' : 'Optional notes'}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  rows={3}
                  data-testid="textarea-notes"
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsActionDialogOpen(false);
                  setSelectedRequest(null);
                  setActionNotes('');
                  setExpectedDeliveryDate('');
                }}
                data-testid="button-cancel-action"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitAction}
                disabled={updateRequestMutation.isPending || (actionType === 'reject' && !actionNotes)}
                variant={actionType === 'reject' ? 'destructive' : 'default'}
                data-testid="button-submit-action"
              >
                {updateRequestMutation.isPending ? 'Processing...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Part / Request Details Dialog */}
      <Dialog open={!!detailRequest} onOpenChange={(open) => { if (!open) setDetailRequest(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detailRequest?.partName || 'Parts Request'}</DialogTitle>
            <DialogDescription>
              {detailRequest ? `Request PR-${detailRequest.id} | Part #${detailRequest.partNumber}` : 'Request details'}
            </DialogDescription>
          </DialogHeader>

          {detailRequest && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="mt-1">{getStatusBadge(detailRequest.status)}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Quantity</div>
                  <div className="text-lg font-semibold">{detailRequest.quantity}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Urgency</div>
                  <div className="mt-1">{getUrgencyBadge(detailRequest.urgency)}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Department</div>
                  <div className="font-medium">{detailRequest.department || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Requested For</div>
                  <div className="font-medium">{detailRequest.requestedForDisplayName || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Requested By</div>
                  <div className="font-medium">{detailRequest.requestedBy}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Vendor</div>
                  <div className="font-medium">
                    {getResolvedVendorForRequest(detailRequest)?.name || detailRequest.inventoryItem?.vendorName || detailRequest.inventoryItem?.source || detailRequest.supplier || 'Unassigned'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Vendor PO</div>
                  <div className="font-medium">
                    {detailRequest.vendorPoId ? `Vendor PO #${detailRequest.vendorPoId}` : 'Not linked'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Estimated Cost</div>
                  <div className="font-medium">
                    {detailRequest.estimatedCost ? `$${detailRequest.estimatedCost.toFixed(2)}` : '-'}
                  </div>
                </div>
              </div>

              {(detailRequest.reason || detailRequest.notes) && (
                <div className="rounded-md border p-3 text-sm">
                  {detailRequest.reason && (
                    <div>
                      <div className="text-muted-foreground">Reason</div>
                      <div>{detailRequest.reason}</div>
                    </div>
                  )}
                  {detailRequest.notes && (
                    <div className={detailRequest.reason ? 'mt-3' : ''}>
                      <div className="text-muted-foreground">Notes</div>
                      <div>{detailRequest.notes}</div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                {!detailRequest.vendorPoId && detailRequest.orderMethod !== 'WEBSITE' && !['REJECTED', 'CANCELED', 'DELIVERED_TO_DEPT'].includes(detailRequest.status) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      openLinkPoDialog(detailRequest);
                      setDetailRequest(null);
                    }}
                  >
                    <LinkIcon className="w-4 h-4 mr-2" />
                    Link Existing PO
                  </Button>
                )}
                <Button variant="outline" onClick={() => setDetailRequest(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Link Existing Vendor PO Dialog */}
      <Dialog
        open={!!linkPoRequest}
        onOpenChange={(open) => {
          if (!open) {
            setLinkPoRequest(null);
            setSelectedVendorPoId('');
            setLinkPoNotes('');
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Link Existing Vendor PO</DialogTitle>
            <DialogDescription>
              {linkPoRequest
                ? `Connect PR-${linkPoRequest.id} for ${linkPoRequest.partName} to an already-created Vendor PO.`
                : 'Select a parts request and Vendor PO.'}
            </DialogDescription>
          </DialogHeader>

          {linkPoRequest && (
            <div className="space-y-4 mt-4">
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium">{linkPoRequest.partName}</div>
                <div className="text-muted-foreground">
                  Part #{linkPoRequest.partNumber} | Qty {linkPoRequest.quantity} | {linkPoRequest.department || 'No department'}
                </div>
                <div className="text-muted-foreground">
                  Resolved vendor: {linkRequestVendor?.name || linkPoRequest.inventoryItem?.vendorName || linkPoRequest.inventoryItem?.source || linkPoRequest.supplier || 'Unassigned'}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Vendor PO</label>
                <Select value={selectedVendorPoId} onValueChange={setSelectedVendorPoId}>
                  <SelectTrigger data-testid="select-existing-vendor-po">
                    <SelectValue placeholder={availableVendorPOsForLink.length ? 'Select an existing Vendor PO' : 'No matching Vendor POs found'} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVendorPOsForLink.map((po) => (
                      <SelectItem key={po.id} value={String(po.id)}>
                        #{po.id}{po.poNumber ? ` | ${po.poNumber}` : ' | RFQ/PO number pending'} | {po.status} | {po.productionLine || 'No category'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {linkRequestVendor && availableVendorPOsForLink.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    No open Vendor POs were found for {linkRequestVendor.name}. Clear the request vendor first or create/use a PO for this vendor.
                  </p>
                )}
              </div>

              {selectedVendorPO && (
                <div className="rounded-md bg-gray-50 dark:bg-gray-900 p-3 text-sm">
                  <div className="font-medium">Selected PO #{selectedVendorPO.id}{selectedVendorPO.poNumber ? ` (${selectedVendorPO.poNumber})` : ''}</div>
                  <div className="text-muted-foreground">
                    Status: {selectedVendorPO.status} | Category: {selectedVendorPO.productionLine || '-'} | Total: ${Number(selectedVendorPO.totalCost || 0).toFixed(2)}
                  </div>
                </div>
              )}

              <label className="flex items-start gap-3 rounded-md border p-3 text-sm cursor-pointer">
                <Checkbox
                  checked={linkPoCreateLine}
                  onCheckedChange={(checked) => setLinkPoCreateLine(checked === true)}
                  data-testid="checkbox-create-po-line"
                />
                <span>
                  <span className="font-medium block">Add this part as a PO line if it is not already on the PO</span>
                  <span className="text-muted-foreground">
                    Leave this on when the PO exists but the request has not been represented as a line item yet.
                  </span>
                </span>
              </label>

              {linkPoCreateLine && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">PO Line Quantity</label>
                    <Input
                      type="number"
                      min="0"
                      value={linkPoQuantity}
                      onChange={(e) => setLinkPoQuantity(e.target.value)}
                      data-testid="input-link-po-quantity"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Unit Price</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={linkPoUnitPrice}
                      onChange={(e) => setLinkPoUnitPrice(e.target.value)}
                      placeholder="0.00"
                      data-testid="input-link-po-unit-price"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">Link Notes</label>
                <Textarea
                  value={linkPoNotes}
                  onChange={(e) => setLinkPoNotes(e.target.value)}
                  placeholder="Optional note explaining why this request is being linked to an existing PO"
                  rows={2}
                  data-testid="textarea-link-po-notes"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setLinkPoRequest(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleLinkVendorPo}
                  disabled={!selectedVendorPoId || linkVendorPoMutation.isPending}
                  data-testid="button-confirm-link-po"
                >
                  {linkVendorPoMutation.isPending ? 'Linking...' : 'Link Vendor PO'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Vendor Assignment Dialog */}
      <Dialog open={isVendorAssignDialogOpen} onOpenChange={setIsVendorAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Vendor</DialogTitle>
            <DialogDescription>
              Assign a vendor to {selectedVendorRequests.size} selected requests
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-1">Vendor</label>
              <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                <SelectTrigger data-testid="select-vendor">
                  <SelectValue placeholder="Select a vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id.toString()}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Order Method</label>
              <Select value={selectedOrderMethod} onValueChange={(v) => setSelectedOrderMethod(v as 'PO' | 'WEBSITE')}>
                <SelectTrigger data-testid="select-order-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PO">Purchase Order (PO)</SelectItem>
                  <SelectItem value="WEBSITE">Website Order</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setIsVendorAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleBulkVendorAssign}
                disabled={bulkUpdateMutation.isPending || !selectedVendorId}
                data-testid="button-confirm-vendor-assign"
              >
                {bulkUpdateMutation.isPending ? 'Assigning...' : 'Assign Vendor'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Order Dialog */}
      <Dialog open={isBulkOrderDialogOpen} onOpenChange={setIsBulkOrderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Ordered</DialogTitle>
            <DialogDescription>
              Mark {selectedVendorRequests.size} selected requests as ordered
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-1">Expected Delivery Date</label>
              <Input
                type="date"
                value={bulkExpectedDelivery}
                onChange={(e) => setBulkExpectedDelivery(e.target.value)}
                data-testid="input-bulk-expected-delivery"
              />
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setIsBulkOrderDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleBulkMarkOrdered}
                disabled={bulkUpdateMutation.isPending}
                data-testid="button-confirm-bulk-order"
              >
                {bulkUpdateMutation.isPending ? 'Processing...' : 'Mark Ordered'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Vendor PO Draft Dialog */}
      <Dialog open={isCreateBatchDialogOpen} onOpenChange={setIsCreateBatchDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Vendor PO Draft</DialogTitle>
            <DialogDescription>
              {batchVendorGroup ? `Create a draft Vendor PO for ${batchVendorGroup.vendorName}. RFQ and PO numbers stay controlled by the existing workflow.` : 'Select items for the draft.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {batchVendorGroup && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Purchasing Category</label>
                    <Select value={batchPurchasingCategory} onValueChange={(value) => setBatchPurchasingCategory(value as typeof batchPurchasingCategory)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="P1">P1</SelectItem>
                        <SelectItem value="P2">P2</SelectItem>
                        <SelectItem value="GENERAL">G&A / General</SelectItem>
                        <SelectItem value="R_AND_D">R&D</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Expected Delivery</label>
                    <Input
                      type="date"
                      value={batchExpectedDelivery}
                      onChange={(e) => setBatchExpectedDelivery(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Ship Via</label>
                    <Input
                      value={batchShipVia}
                      onChange={(e) => setBatchShipVia(e.target.value)}
                      placeholder="UPS, FedEx, vendor truck..."
                    />
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto border rounded-lg">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Part</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Dept</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Requested</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Order Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {batchVendorGroup.requests
                        .filter(r => r.status === 'APPROVED' && r.orderMethod !== 'WEBSITE' && !r.vendorPoId)
                        .map(request => (
                          <tr key={request.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                            <td className="px-3 py-2">
                              <div className="text-sm font-medium">{request.partName}</div>
                              <div className="text-xs text-gray-500">{request.partNumber}</div>
                            </td>
                            <td className="px-3 py-2 text-sm">{request.department}</td>
                            <td className="px-3 py-2 text-center text-sm">{request.quantity}</td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                min="0"
                                value={batchQuantities[request.id] ?? request.quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setBatchQuantities(prev => ({ ...prev, [request.id]: val }));
                                }}
                                className="w-20 text-center mx-auto"
                              />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Notes (optional)</label>
                  <Textarea
                    value={batchNotes}
                    onChange={(e) => setBatchNotes(e.target.value)}
                    placeholder="Order notes..."
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsCreateBatchDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateBatch}
                    disabled={createBatchMutation.isPending}
                  >
                    {createBatchMutation.isPending ? 'Creating...' : 'Create Vendor PO Draft'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
