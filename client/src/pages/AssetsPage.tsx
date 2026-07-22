import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function useIsAdmin() {
  const { data: session } = useQuery<any>({ queryKey: ['/api/auth/session'] });
  const role = session?.role;
  return role === 'ADMIN' || role === 'OWNER';
}
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Box,
  Edit,
  MapPin,
  Search,
  ArrowUpDown,
  ClipboardList,
  ShoppingCart,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

type AssetCategory = {
  id: string;
  name: string;
  parentCategoryId: string | null;
  description: string | null;
  createdAt: string;
};

type AssetLocation = {
  id: string;
  name: string;
  description: string | null;
  building: string | null;
  floor: string | null;
  room: string | null;
  createdAt: string;
};

type AssetRow = {
  id: string;
  assetTag: string;
  name: string;
  categoryId: string | null;
  parentAssetId: string | null;
  physicalLocationId: string | null;
  status: string;
  purchaseDate: string | null;
  purchaseCost: string | null;
  vendorName: string | null;
  warrantyExpiration: string | null;
  expectedLifeYears: number | null;
  notes: string | null;
  createdAt: string;
  retiredAt: string | null;
  categoryName: string | null;
  locationName: string | null;
};

type VendorOption = {
  id: number;
  name: string;
  isActive?: boolean;
};

type TreeNode = AssetCategory & { children: TreeNode[] };

function buildTree(categories: AssetCategory[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  categories.forEach((c) => map.set(c.id, { ...c, children: [] }));
  categories.forEach((c) => {
    const node = map.get(c.id)!;
    if (c.parentCategoryId && map.has(c.parentCategoryId)) {
      map.get(c.parentCategoryId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function CategoryTreeItem({
  node,
  selectedId,
  onSelect,
  onDelete,
  level = 0,
}: {
  node: TreeNode;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDelete?: (id: string, name: string) => void;
  level?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div className="group flex items-center">
        <button
          className={`flex-1 flex items-center gap-1 px-2 py-1.5 text-sm rounded-md hover:bg-gray-100 ${
            isSelected ? 'bg-primary/10 text-primary font-medium' : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => {
            if (hasChildren) setExpanded(!expanded);
            onSelect(isSelected ? null : node.id);
          }}
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="h-3 w-3 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 flex-shrink-0" />
            )
          ) : (
            <span className="w-3" />
          )}
          {expanded && hasChildren ? (
            <FolderOpen className="h-4 w-4 flex-shrink-0 text-amber-500" />
          ) : (
            <Folder className="h-4 w-4 flex-shrink-0 text-amber-500" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {onDelete && (
          <button
            className="opacity-0 group-hover:opacity-100 p-1 mr-1 text-red-400 hover:text-red-600 rounded transition-opacity"
            title={`Delete ${node.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id, node.name);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {expanded &&
        hasChildren &&
        node.children.map((child) => (
          <CategoryTreeItem
            key={child.id}
            node={child}
            selectedId={selectedId}
            onDelete={onDelete}
            onSelect={onSelect}
            level={level + 1}
          />
        ))}
    </div>
  );
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  idle: 'bg-yellow-100 text-yellow-800',
  out_of_service: 'bg-red-100 text-red-800',
  retired: 'bg-gray-100 text-gray-800',
};

export default function AssetsPage() {
  const isAdmin = useIsAdmin();
  const { toast } = useToast();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('assetTag');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetRow | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [showPartsListModal, setShowPartsListModal] = useState(false);
  const [partsListAssetLabel, setPartsListAssetLabel] = useState('');
  const [requestingPart, setRequestingPart] = useState<any | null>(null);
  const [requestQty, setRequestQty] = useState(1);
  const [requestUrgency, setRequestUrgency] = useState('MEDIUM');
  const [requestReason, setRequestReason] = useState('');
  const [selectedRequestDeptId, setSelectedRequestDeptId] = useState<number | null>(null);
  const [selectedRequestDeptName, setSelectedRequestDeptName] = useState('');

  const [formData, setFormData] = useState({
    assetTag: '',
    name: '',
    categoryId: '',
    parentAssetId: '',
    physicalLocationId: '',
    status: 'active',
    purchaseDate: '',
    purchaseCost: '',
    vendorName: '',
    warrantyExpiration: '',
    expectedLifeYears: '',
    notes: '',
  });

  const [categoryFormData, setCategoryFormData] = useState({
    name: '',
    parentCategoryId: '',
    description: '',
  });

  const [locationFormData, setLocationFormData] = useState({
    name: '',
    building: '',
    floor: '',
    room: '',
    description: '',
  });

  const { data: categories = [] } = useQuery<AssetCategory[]>({
    queryKey: ['/api/assets/categories'],
  });

  const { data: locations = [] } = useQuery<AssetLocation[]>({
    queryKey: ['/api/assets/locations'],
  });

  const { data: allAssets = [], isLoading } = useQuery<AssetRow[]>({
    queryKey: ['/api/assets'],
  });

  const { data: inventoryItems = [] } = useQuery<any[]>({
    queryKey: ['/api/enhanced/inventory/items'],
  });

  const { data: currentUser } = useQuery<any>({
    queryKey: ['/api/auth/session'],
  });

  const { data: departments = [] } = useQuery<any[]>({
    queryKey: ['/api/inventory/departments'],
    enabled: isAdmin,
  });

  const { data: vendorsResponse, isLoading: vendorsLoading } = useQuery<{
    data: VendorOption[];
  }>({
    queryKey: ['/api/vendors', 'asset-form-select'],
    queryFn: () =>
      apiRequest('/api/vendors?pageSize=10000&approved=any&sort=name:asc'),
  });
  const vendors = vendorsResponse?.data ?? [];

  const submitRequestMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest('/api/inventory/parts-requests', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: 'Parts request submitted', description: `Request for ${requestingPart?.name} has been submitted.` });
      setRequestingPart(null);
      setRequestQty(1);
      setRequestUrgency('MEDIUM');
      setRequestReason('');
      setSelectedRequestDeptId(null);
      setSelectedRequestDeptName('');
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to submit parts request.', variant: 'destructive' });
    },
  });

  const handleSubmitPartRequest = () => {
    if (!requestingPart || !currentUser) return;
    if (requestQty < 1) {
      toast({ title: 'Invalid quantity', description: 'Please enter a quantity of at least 1.', variant: 'destructive' });
      return;
    }
    if (isAdmin && !selectedRequestDeptId) {
      toast({ title: 'Select a department', description: 'Please choose a department for this request.', variant: 'destructive' });
      return;
    }
    submitRequestMutation.mutate({
      agPartNumber: requestingPart.agPartNumber,
      partNumber: requestingPart.agPartNumber,
      partName: requestingPart.name,
      requestedBy: currentUser.username,
      quantity: requestQty,
      urgency: requestUrgency,
      reason: requestReason.trim() || null,
      department: isAdmin ? selectedRequestDeptName : (currentUser.department || ''),
      departmentId: isAdmin ? selectedRequestDeptId : (currentUser.departmentId || null),
    });
  };

  const tree = useMemo(() => buildTree(categories), [categories]);

  const filteredAssets = useMemo(() => {
    let result = [...allAssets];
    if (selectedCategoryId) {
      const getAllChildIds = (catId: string): string[] => {
        const ids = [catId];
        categories
          .filter((c) => c.parentCategoryId === catId)
          .forEach((c) => ids.push(...getAllChildIds(c.id)));
        return ids;
      };
      const catIds = getAllChildIds(selectedCategoryId);
      result = result.filter((a) => a.categoryId && catIds.includes(a.categoryId));
    }
    if (statusFilter !== 'all') {
      result = result.filter((a) => a.status === statusFilter);
    }
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(
        (a) =>
          a.assetTag.toLowerCase().includes(lower) ||
          a.name.toLowerCase().includes(lower) ||
          (a.categoryName && a.categoryName.toLowerCase().includes(lower)) ||
          (a.locationName && a.locationName.toLowerCase().includes(lower))
      );
    }
    result.sort((a, b) => {
      const aVal = (a as any)[sortField] || '';
      const bVal = (b as any)[sortField] || '';
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [allAssets, selectedCategoryId, statusFilter, searchTerm, sortField, sortDir, categories]);

  const createAssetMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/assets', { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets'] });
      setShowAssetForm(false);
      resetForm();
      toast({ title: 'Asset created successfully' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to create asset', variant: 'destructive' });
    },
  });

  const updateAssetMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest(`/api/assets/${id}`, { method: 'PUT', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets'] });
      setShowAssetForm(false);
      setEditingAsset(null);
      resetForm();
      toast({ title: 'Asset updated successfully' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to update asset', variant: 'destructive' });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/assets/categories', { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets/categories'] });
      setShowCategoryForm(false);
      setCategoryFormData({ name: '', parentCategoryId: '', description: '' });
      toast({ title: 'Category created' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/assets/categories/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets/categories'] });
      if (selectedCategoryId) setSelectedCategoryId(null);
      toast({ title: 'Category deleted' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteLocationMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/assets/locations/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets/locations'] });
      toast({ title: 'Location deleted' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteAssetMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/assets/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets'] });
      toast({ title: 'Asset deleted' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const createLocationMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/assets/locations', { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets/locations'] });
      setShowLocationForm(false);
      setLocationFormData({ name: '', building: '', floor: '', room: '', description: '' });
      toast({ title: 'Location created' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  function resetForm() {
    setFormData({
      assetTag: '', name: '', categoryId: '', parentAssetId: '', physicalLocationId: '',
      status: 'active', purchaseDate: '', purchaseCost: '', vendorName: '',
      warrantyExpiration: '', expectedLifeYears: '', notes: '',
    });
  }

  function openEdit(asset: AssetRow) {
    setEditingAsset(asset);
    setFormData({
      assetTag: asset.assetTag,
      name: asset.name,
      categoryId: asset.categoryId || '',
      parentAssetId: asset.parentAssetId || '',
      physicalLocationId: asset.physicalLocationId || '',
      status: asset.status,
      purchaseDate: asset.purchaseDate || '',
      purchaseCost: asset.purchaseCost || '',
      vendorName: asset.vendorName || '',
      warrantyExpiration: asset.warrantyExpiration || '',
      expectedLifeYears: asset.expectedLifeYears ? String(asset.expectedLifeYears) : '',
      notes: asset.notes || '',
    });
    setShowAssetForm(true);
  }

  function handleSubmitAsset() {
    const payload: any = {
      assetTag: formData.assetTag,
      name: formData.name,
      status: formData.status,
    };
    if (formData.categoryId) payload.categoryId = formData.categoryId;
    if (formData.parentAssetId) payload.parentAssetId = formData.parentAssetId;
    if (formData.physicalLocationId) payload.physicalLocationId = formData.physicalLocationId;
    if (formData.purchaseDate) payload.purchaseDate = formData.purchaseDate;
    if (formData.purchaseCost) payload.purchaseCost = formData.purchaseCost;
    if (formData.vendorName) payload.vendorName = formData.vendorName;
    if (formData.warrantyExpiration) payload.warrantyExpiration = formData.warrantyExpiration;
    if (formData.expectedLifeYears) payload.expectedLifeYears = parseInt(formData.expectedLifeYears);
    if (formData.notes) payload.notes = formData.notes;

    if (editingAsset) {
      updateAssetMutation.mutate({ id: editingAsset.id, data: payload });
    } else {
      createAssetMutation.mutate(payload);
    }
  }

  function toggleSort(field: string) {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Box className="h-6 w-6" />
            Assets
          </h1>
          <p className="text-gray-500">Manage equipment, machinery, and tools</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowLocationForm(true)}>
              <MapPin className="h-4 w-4 mr-1" /> Add Location
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowCategoryForm(true)}>
              <Folder className="h-4 w-4 mr-1" /> Add Category
            </Button>
            <Button onClick={() => { resetForm(); setEditingAsset(null); setShowAssetForm(true); }}>
              <Plus className="h-4 w-4 mr-1" /> New Asset
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-4">
        {/* Category Tree Sidebar */}
        <Card className="w-64 flex-shrink-0">
          <CardHeader className="py-3 px-3">
            <CardTitle className="text-sm">Categories</CardTitle>
          </CardHeader>
          <CardContent className="p-2 max-h-[calc(100vh-280px)] overflow-y-auto">
            <button
              className={`w-full flex items-center gap-1 px-2 py-1.5 text-sm rounded-md hover:bg-gray-100 ${
                !selectedCategoryId ? 'bg-primary/10 text-primary font-medium' : ''
              }`}
              onClick={() => setSelectedCategoryId(null)}
            >
              <Box className="h-4 w-4" />
              All Assets
            </button>
            {tree.map((node) => (
              <CategoryTreeItem
                key={node.id}
                node={node}
                selectedId={selectedCategoryId}
                onSelect={setSelectedCategoryId}
                onDelete={isAdmin ? (id, name) => {
                  if (window.confirm(`Delete category "${name}"? This cannot be undone.`)) {
                    deleteCategoryMutation.mutate(id);
                  }
                } : undefined}
              />
            ))}
            {tree.length === 0 && (
              <p className="text-xs text-gray-400 px-2 py-4 text-center">No categories yet</p>
            )}
          </CardContent>
        </Card>

        {/* Main Table */}
        <div className="flex-1 space-y-3">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by tag, name, category, location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="idle">Idle</SelectItem>
                <SelectItem value="out_of_service">Out of Service</SelectItem>
                <SelectItem value="retired">Retired</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      { key: 'assetTag', label: 'Asset Tag' },
                      { key: 'name', label: 'Name' },
                      { key: 'categoryName', label: 'Category' },
                      { key: 'locationName', label: 'Location' },
                      { key: 'status', label: 'Status' },
                    ].map((col) => (
                      <TableHead key={col.key}>
                        <button
                          className="flex items-center gap-1 hover:text-primary"
                          onClick={() => toggleSort(col.key)}
                        >
                          {col.label}
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </TableHead>
                    ))}
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-400">
                        Loading assets...
                      </TableCell>
                    </TableRow>
                  ) : filteredAssets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-400">
                        No assets found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAssets.map((asset) => (
                      <TableRow key={asset.id} className="hover:bg-gray-50">
                        <TableCell className="font-mono font-medium">{asset.assetTag}</TableCell>
                        <TableCell>{asset.name}</TableCell>
                        <TableCell>{asset.categoryName || '—'}</TableCell>
                        <TableCell>{asset.locationName || '—'}</TableCell>
                        <TableCell>
                          <Badge className={statusColors[asset.status] || 'bg-gray-100'}>
                            {asset.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isAdmin && (
                            <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(asset)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600" onClick={() => {
                              if (window.confirm(`Delete asset "${asset.assetTag} - ${asset.name}"? This cannot be undone.`)) {
                                deleteAssetMutation.mutate(asset.id);
                              }
                            }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <p className="text-xs text-gray-400">{filteredAssets.length} asset{filteredAssets.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Asset Form Dialog */}
      <Dialog open={showAssetForm} onOpenChange={setShowAssetForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAsset ? 'Edit Asset' : 'New Asset'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Asset Tag *</Label>
              <Input value={formData.assetTag} onChange={(e) => setFormData({ ...formData, assetTag: e.target.value })} placeholder="e.g. CNC-001" />
            </div>
            <div>
              <Label>Name *</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Haas VF-2 CNC Mill" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={formData.categoryId} onValueChange={(v) => setFormData({ ...formData, categoryId: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Parent Asset</Label>
              <Select value={formData.parentAssetId} onValueChange={(v) => setFormData({ ...formData, parentAssetId: v })}>
                <SelectTrigger><SelectValue placeholder="None (top-level)" /></SelectTrigger>
                <SelectContent>
                  {allAssets
                    .filter((a) => a.id !== editingAsset?.id)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.assetTag} - {a.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Physical Location</Label>
              <Select value={formData.physicalLocationId} onValueChange={(v) => setFormData({ ...formData, physicalLocationId: v })}>
                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}{l.building ? ` (${l.building})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="idle">Idle</SelectItem>
                  <SelectItem value="out_of_service">Out of Service</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Purchase Date</Label>
              <Input type="date" value={formData.purchaseDate} onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })} />
            </div>
            <div>
              <Label>Purchase Cost ($)</Label>
              <Input type="number" step="0.01" value={formData.purchaseCost} onChange={(e) => setFormData({ ...formData, purchaseCost: e.target.value })} placeholder="0.00" />
            </div>
            <div>
              <Label>Vendor</Label>
              <Select
                value={formData.vendorName || '__none__'}
                onValueChange={(value) =>
                  setFormData({ ...formData, vendorName: value === '__none__' ? '' : value })
                }
                disabled={vendorsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={vendorsLoading ? 'Loading vendors...' : 'Select vendor'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No vendor</SelectItem>
                  {formData.vendorName && !vendors.some((vendor) => vendor.name === formData.vendorName) && (
                    <SelectItem value={formData.vendorName}>{formData.vendorName}</SelectItem>
                  )}
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.name}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Warranty Expiration</Label>
              <Input type="date" value={formData.warrantyExpiration} onChange={(e) => setFormData({ ...formData, warrantyExpiration: e.target.value })} />
            </div>
            <div>
              <Label>Expected Life (years)</Label>
              <Input type="number" value={formData.expectedLifeYears} onChange={(e) => setFormData({ ...formData, expectedLifeYears: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3} />
            </div>
          </div>
          <div className="flex justify-between items-center mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const label = `${formData.name} (${formData.assetTag})`;
                setPartsListAssetLabel(label);
                setShowPartsListModal(true);
              }}
              disabled={!formData.assetTag || !formData.name}
            >
              <ClipboardList className="h-4 w-4 mr-2" />
              AG Parts List
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowAssetForm(false)}>Cancel</Button>
              <Button
                onClick={handleSubmitAsset}
                disabled={!formData.assetTag || !formData.name || createAssetMutation.isPending || updateAssetMutation.isPending}
              >
                {createAssetMutation.isPending || updateAssetMutation.isPending ? 'Saving...' : editingAsset ? 'Update Asset' : 'Create Asset'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* AG Parts List Modal */}
      <Dialog open={showPartsListModal} onOpenChange={setShowPartsListModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              AG Parts List — {partsListAssetLabel}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const assignedParts = inventoryItems.filter(
              (item: any) => item.assignedToAsset === partsListAssetLabel
            );
            if (assignedParts.length === 0) {
              return (
                <div className="text-center py-8 text-gray-500">
                  <ClipboardList className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>No inventory items are assigned to this asset.</p>
                  <p className="text-sm mt-1">
                    Assign items from the Inventory Items page using the "Assigned to Asset" field.
                  </p>
                </div>
              );
            }
            return (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>AG Part #</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Supplier Part #</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Request</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignedParts.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono font-medium">{item.agPartNumber}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.source || '—'}</TableCell>
                      <TableCell>{item.supplierPartNumber || '—'}</TableCell>
                      <TableCell>{item.department || '—'}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRequestingPart(item);
                            setRequestQty(1);
                            setRequestUrgency('MEDIUM');
                            setRequestReason('');
                            setSelectedRequestDeptId(null);
                            setSelectedRequestDeptName('');
                          }}
                        >
                          <ShoppingCart className="h-3 w-3 mr-1" />
                          Request
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            );
          })()}
          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={() => setShowPartsListModal(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Request Part Modal */}
      <Dialog open={!!requestingPart} onOpenChange={(open) => { if (!open) setRequestingPart(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Request Part
            </DialogTitle>
          </DialogHeader>
          {requestingPart && (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3 space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Part</p>
                <p className="font-mono font-semibold text-sm">{requestingPart.agPartNumber}</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{requestingPart.name}</p>
              </div>

              {isAdmin && (
                <div>
                  <Label>Department <span className="text-red-500">*</span></Label>
                  <Select
                    value={selectedRequestDeptId ? String(selectedRequestDeptId) : ''}
                    onValueChange={(val) => {
                      const dept = departments.find((d: any) => String(d.id) === val);
                      setSelectedRequestDeptId(dept?.id ?? null);
                      setSelectedRequestDeptName(dept?.name ?? '');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select department..." />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d: any) => (
                        <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>Quantity <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  min={1}
                  value={requestQty}
                  onChange={(e) => setRequestQty(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>

              <div>
                <Label>Urgency</Label>
                <Select value={requestUrgency} onValueChange={setRequestUrgency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Reason <span className="text-gray-400 text-xs">(optional)</span></Label>
                <Textarea
                  rows={3}
                  placeholder="Why is this part needed?"
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setRequestingPart(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitPartRequest}
                  disabled={submitRequestMutation.isPending}
                >
                  {submitRequestMutation.isPending ? 'Submitting...' : 'Submit Request'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Category Form Dialog */}
      <Dialog open={showCategoryForm} onOpenChange={setShowCategoryForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={categoryFormData.name} onChange={(e) => setCategoryFormData({ ...categoryFormData, name: e.target.value })} placeholder="e.g. CNC Machines" />
            </div>
            <div>
              <Label>Parent Category</Label>
              <Select value={categoryFormData.parentCategoryId} onValueChange={(v) => setCategoryFormData({ ...categoryFormData, parentCategoryId: v })}>
                <SelectTrigger><SelectValue placeholder="None (top-level)" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={categoryFormData.description} onChange={(e) => setCategoryFormData({ ...categoryFormData, description: e.target.value })} rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowCategoryForm(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const data: any = { name: categoryFormData.name };
                if (categoryFormData.parentCategoryId) data.parentCategoryId = categoryFormData.parentCategoryId;
                if (categoryFormData.description) data.description = categoryFormData.description;
                createCategoryMutation.mutate(data);
              }}
              disabled={!categoryFormData.name || createCategoryMutation.isPending}
            >
              {createCategoryMutation.isPending ? 'Creating...' : 'Create Category'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Location Form Dialog */}
      <Dialog open={showLocationForm} onOpenChange={setShowLocationForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Location</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={locationFormData.name} onChange={(e) => setLocationFormData({ ...locationFormData, name: e.target.value })} placeholder="e.g. Machine Shop Bay 1" />
            </div>
            <div>
              <Label>Building</Label>
              <Input value={locationFormData.building} onChange={(e) => setLocationFormData({ ...locationFormData, building: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Floor</Label>
                <Input value={locationFormData.floor} onChange={(e) => setLocationFormData({ ...locationFormData, floor: e.target.value })} />
              </div>
              <div>
                <Label>Room</Label>
                <Input value={locationFormData.room} onChange={(e) => setLocationFormData({ ...locationFormData, room: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={locationFormData.description} onChange={(e) => setLocationFormData({ ...locationFormData, description: e.target.value })} rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowLocationForm(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const data: any = { name: locationFormData.name };
                if (locationFormData.building) data.building = locationFormData.building;
                if (locationFormData.floor) data.floor = locationFormData.floor;
                if (locationFormData.room) data.room = locationFormData.room;
                if (locationFormData.description) data.description = locationFormData.description;
                createLocationMutation.mutate(data);
              }}
              disabled={!locationFormData.name || createLocationMutation.isPending}
            >
              {createLocationMutation.isPending ? 'Creating...' : 'Create Location'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
