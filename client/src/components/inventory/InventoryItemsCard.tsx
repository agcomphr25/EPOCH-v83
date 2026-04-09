import React, { useState, useCallback, useEffect } from 'react';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Edit,
  Trash2,
  Download,
  Upload,
  Search,
  Package,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  GitBranch,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'wouter';
import type { InventoryItem, ItemGroup, ManufacturedCategory } from '@shared/schema';
import { getSupplySourceDashboard, supplySourceDashboardToLegacyDept } from '@shared/schema';
import { MANUFACTURED_CATEGORY_ORDER, CATEGORY_DISPLAY_NAMES, DASHBOARD_DISPLAY_NAMES } from '@/lib/inventoryConstants';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

import InventoryItemCostHistory from './InventoryItemCostHistory';
import TraceabilityConfigModal from './TraceabilityConfigModal';

import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChevronDown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocation } from 'wouter';
import { calculateCOGS } from '@/lib/unitConversion';
import { parseLeadTimeToDays } from '@/utils/leadTimeUtils';

interface InventoryFormData {
  agPartNumber: string;
  sku: string;
  name: string;
  type: string;
  itemType: string;
  manufacturedCategory: string;
  manufacturingLevel: string;
  manufacturingDepartment: string;
  machineType: string;
  source: string;
  vendorId: string;
  supplierPartNumber: string;
  secondarySupplierPartNumber: string;
  costPer: string;
  vendorUnit: string;
  purchaseUnitLabel: string;
  purchaseUnit: string;
  purchaseQuantity: string;
  consumptionRate: string;
  usageUnit: string;
  cogsPerUnit: string;
  orderDate: string;
  department: string;
  assignedDepartments: string[];
  leadTimeDays: string;
  secondarySource: string;
  notes: string;
  isStockItem: boolean;
  utilizedInPL1: boolean;
  utilizedInPL2: boolean;
  utilizedInPL3: boolean;
  traceabilityRequired: boolean;
  traceabilityFields: string[];
  utilizedInFacilities: boolean;
  utilizedInAdmin: boolean;
  utilizedInServices: boolean;
  isPacket: boolean;
  isFabric: boolean;
  hasSds: boolean;
  hasTds: boolean;
  hasOtherDocs: boolean;
  assignedToAsset: string;
  defaultOrderMethod: string;
  purchaseUnitId: string;
  usageUnitId: string;
}

const InventoryForm = ({
  formData,
  onSubmit,
  onChange,
  onSelectChange,
  onMultiSelectChange,
  onCheckboxChange,
  onFileChange,
  editingItem,
  isCreatePending,
  isUpdatePending,
  onCancel,
  vendors,
  assets,
  departments,
  sdsFile,
  currentSdsFileName,
  tdsFile,
  currentTdsFileName,
  otherDocsFile,
  currentOtherDocsFileName,
  onTraceabilityClick,
  isTraceabilityModalOpen,
  onCloseTraceabilityModal,
  onSaveTraceabilityFields,
}: {
  formData: InventoryFormData;
  onSubmit: (e: React.FormEvent) => void;
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  onSelectChange: (name: string, value: string) => void;
  onMultiSelectChange: (name: string, values: string[]) => void;
  onCheckboxChange: (name: string, checked: boolean) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  editingItem: InventoryItem | null;
  isCreatePending: boolean;
  isUpdatePending: boolean;
  onCancel: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vendors: any[];
  assets: { id: string; assetTag: string; name: string; status: string }[];
  departments: { id: number; name: string }[];
  sdsFile: File | null;
  currentSdsFileName: string | null;
  tdsFile: File | null;
  currentTdsFileName: string | null;
  otherDocsFile: File | null;
  currentOtherDocsFileName: string | null;
  onTraceabilityClick: () => void;
  isTraceabilityModalOpen: boolean;
  onCloseTraceabilityModal: () => void;
  onSaveTraceabilityFields: (fields: string[]) => void;
}) => {
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);

  const { data: allUnits = [] } = useQuery<Array<{ id: number; symbol: string; family: string; family_id: number }>>({
    queryKey: ['/api/units'],
  });

  const unitsByFamily = allUnits.reduce((acc, unit) => {
    if (!acc[unit.family]) acc[unit.family] = [];
    acc[unit.family].push(unit);
    return acc;
  }, {} as Record<string, typeof allUnits>);

  const checkDuplicate = useCallback(async (partNumber: string) => {
    if (!partNumber.trim()) {
      setDuplicateWarning(null);
      return;
    }
    setIsCheckingDuplicate(true);
    try {
      const res = await fetch(`/api/inventory/items/check-part-number/${encodeURIComponent(partNumber.trim())}`);
      const data = await res.json();
      if (data.exists) {
        setDuplicateWarning(`Part# ${partNumber} already exists: "${data.existingItem?.name}"`);
      } else {
        setDuplicateWarning(null);
      }
    } catch {
      setDuplicateWarning(null);
    } finally {
      setIsCheckingDuplicate(false);
    }
  }, []);

  useEffect(() => {
    if (!editingItem && formData.agPartNumber) {
      const timeout = setTimeout(() => checkDuplicate(formData.agPartNumber), 400);
      return () => clearTimeout(timeout);
    } else {
      setDuplicateWarning(null);
    }
  }, [formData.agPartNumber, editingItem, checkDuplicate]);

  type UtilizedKey = 'utilizedInPL1' | 'utilizedInPL2' | 'utilizedInPL3' | 'utilizedInFacilities' | 'utilizedInAdmin' | 'utilizedInServices';
  const utilizedOptions: { key: UtilizedKey; label: string }[] = [
    { key: 'utilizedInPL1', label: 'PL1' },
    { key: 'utilizedInPL2', label: 'PL2' },
    { key: 'utilizedInPL3', label: 'PL3' },
    { key: 'utilizedInFacilities', label: 'Facilities' },
    { key: 'utilizedInAdmin', label: 'Admin' },
    { key: 'utilizedInServices', label: 'Services' },
  ];
  const selectedUtilizedLabels = utilizedOptions.filter(o => formData[o.key]).map(o => o.label);

  return (
  <form
    onSubmit={(e) => {
      if (duplicateWarning && !editingItem) {
        e.preventDefault();
        toast.error('Cannot create item: AG Part# already exists');
        return;
      }
      onSubmit(e);
    }}
    className="space-y-6 max-h-[70vh] overflow-y-auto pr-2"
  >
    {/* Section 1 — Item Identity */}
    <div className="space-y-4">
      <h4 className="text-md font-semibold border-b pb-2">Item Identity</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="agPartNumber">AG Part# *</Label>
          <Input
            id="agPartNumber"
            name="agPartNumber"
            value={formData.agPartNumber}
            onChange={onChange}
            placeholder="Enter AG Part#"
            data-testid="input-agPartNumber"
            required
            className={duplicateWarning ? 'border-red-500' : ''}
          />
          {duplicateWarning && (
            <p className="text-xs text-red-600 mt-1">{duplicateWarning}</p>
          )}
          {isCheckingDuplicate && (
            <p className="text-xs text-gray-400 mt-1">Checking...</p>
          )}
        </div>
        <div>
          <Label htmlFor="sku">SKU</Label>
          <Input
            id="sku"
            name="sku"
            value={formData.sku}
            onChange={onChange}
            placeholder="Enter SKU (informational)"
            data-testid="input-sku"
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={onChange}
            placeholder="Enter item name"
            data-testid="input-name"
            required
          />
        </div>
        <div>
          <Label htmlFor="itemType">Item Type</Label>
          <Select
            value={formData.itemType || formData.type || 'PURCHASED'}
            onValueChange={(value) => {
              onSelectChange('itemType', value);
              onSelectChange('type', value === 'MANUFACTURED' ? 'Manufactured' : 'Purchased');
              if (value === 'PURCHASED') {
                onSelectChange('manufacturedCategory', '');
                onSelectChange('manufacturingLevel', '');
                onSelectChange('machineType', '');
              }
            }}
          >
            <SelectTrigger data-testid="select-itemType">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PURCHASED">Purchased</SelectItem>
              <SelectItem value="MANUFACTURED">Manufactured</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(formData.itemType === 'MANUFACTURED' || formData.type === 'Manufactured') && (
          <>
            <div>
              <Label htmlFor="manufacturedCategory">Category *</Label>
              <Select
                value={formData.manufacturedCategory || ''}
                onValueChange={(value) => {
                  onSelectChange('manufacturedCategory', value);
                  if (value !== 'MACHINED_PART') {
                    onSelectChange('machineType', '');
                  }
                }}
              >
                <SelectTrigger data-testid="select-manufacturedCategory">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PACKET">Packet</SelectItem>
                  <SelectItem value="KIT">Kitting</SelectItem>
                  <SelectItem value="MACHINED_PART">Machined Part</SelectItem>
                  <SelectItem value="CORE">Core</SelectItem>
                  <SelectItem value="SUB_ASSEMBLY">Sub-Assembly</SelectItem>
                  <SelectItem value="ASSEMBLY">Assembly</SelectItem>
                  <SelectItem value="COMPOSITE">Composite</SelectItem>
                  <SelectItem value="COMPONENT">Component</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.manufacturedCategory === 'MACHINED_PART' && (
              <div>
                <Label htmlFor="machineType">Machine Type</Label>
                <Select
                  value={formData.machineType || ''}
                  onValueChange={(value) => onSelectChange('machineType', value === '_none' ? '' : value)}
                >
                  <SelectTrigger data-testid="select-machineType">
                    <SelectValue placeholder="Select machine type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None / Not specified</SelectItem>
                    <SelectItem value="CNC Mill 3rd Axis">CNC Mill 3rd Axis</SelectItem>
                    <SelectItem value="CNC Mill 4th Axis">CNC Mill 4th Axis</SelectItem>
                    <SelectItem value="Lathe">Lathe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="manufacturingLevel">Manufacturing Level</Label>
              <Select
                value={formData.manufacturingLevel || ''}
                onValueChange={(value) => onSelectChange('manufacturingLevel', value)}
              >
                <SelectTrigger data-testid="select-manufacturingLevel">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPONENT">Component</SelectItem>
                  <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
                  <SelectItem value="FINAL">Final</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.manufacturedCategory && (
              <div className="md:col-span-2">
                <Label>Supply Source Dashboard</Label>
                <div className="mt-1">
                  {supplySourceDashboardToLegacyDept(
                    getSupplySourceDashboard(formData.manufacturedCategory as ManufacturedCategory)
                  ) ? (
                    <Badge variant="secondary" className="text-sm">
                      {supplySourceDashboardToLegacyDept(
                        getSupplySourceDashboard(formData.manufacturedCategory as ManufacturedCategory)
                      )}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">None</span>
                  )}
                  <p className="text-xs text-gray-500 mt-1">Derived automatically from category</p>
                </div>
              </div>
            )}
          </>
        )}
        <div className="flex items-center space-x-2 pt-6">
          <Checkbox
            id="isStockItem"
            checked={formData.isStockItem}
            onCheckedChange={(checked) =>
              onCheckboxChange('isStockItem', checked as boolean)
            }
            data-testid="checkbox-isStockItem"
          />
          <Label htmlFor="isStockItem" className="cursor-pointer">
            Stock Item
          </Label>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <div>
          <Label>Utilized In</Label>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-between w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <span className="flex flex-wrap gap-1">
                  {selectedUtilizedLabels.length === 0 ? (
                    <span className="text-muted-foreground">Select areas...</span>
                  ) : (
                    selectedUtilizedLabels.map((label) => (
                      <Badge key={label} variant="secondary" className="text-xs">{label}</Badge>
                    ))
                  )}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              {utilizedOptions.map(({ key, label }) => (
                <div key={key} className="flex items-center space-x-2 py-1.5 px-1 rounded hover:bg-accent cursor-pointer" onClick={() => onCheckboxChange(key, !formData[key])}>
                  <Checkbox
                    id={key}
                    checked={formData[key]}
                    onCheckedChange={(checked) => onCheckboxChange(key, checked as boolean)}
                    data-testid={`checkbox-${key}`}
                  />
                  <Label htmlFor={key} className="cursor-pointer text-sm font-normal">{label}</Label>
                </div>
              ))}
            </PopoverContent>
          </Popover>
        </div>
        {formData.utilizedInPL2 && (
          <div className="flex items-center space-x-2 pt-6">
            <Checkbox
              id="traceabilityRequired"
              checked={formData.traceabilityRequired}
              onCheckedChange={(checked) => {
                if (checked) {
                  onTraceabilityClick();
                } else {
                  onCheckboxChange('traceabilityRequired', false);
                  onSaveTraceabilityFields([]);
                }
              }}
              data-testid="checkbox-traceabilityRequired"
            />
            <Label
              htmlFor="traceabilityRequired"
              className="cursor-pointer"
              onClick={(e) => {
                if (formData.traceabilityRequired) {
                  e.preventDefault();
                  onTraceabilityClick();
                }
              }}
            >
              Traceability Required
              {formData.traceabilityFields.length > 0 && (
                <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                  ({formData.traceabilityFields.length} field{formData.traceabilityFields.length !== 1 ? 's' : ''})
                </span>
              )}
            </Label>
          </div>
        )}
        <div className="flex items-center space-x-2 pt-6">
          <Checkbox
            id="isFabric"
            checked={formData.isFabric}
            onCheckedChange={(checked) =>
              onCheckboxChange('isFabric', checked as boolean)
            }
            data-testid="checkbox-isFabric"
          />
          <Label htmlFor="isFabric" className="cursor-pointer">Fabric (Cutting Table)</Label>
        </div>
      </div>
    </div>

    {/* Section 2 — Purchasing */}
    <div className="space-y-4">
      <h4 className="text-md font-semibold border-b pb-2">Purchasing</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="vendorId">Vendor</Label>
          <Select
            value={formData.vendorId}
            onValueChange={(value) => onSelectChange('vendorId', value)}
          >
            <SelectTrigger data-testid="select-vendorId">
              <SelectValue placeholder="Select vendor (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {Array.isArray(vendors) &&
                [...vendors].sort((a, b) => a.name.localeCompare(b.name)).map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id.toString()}>
                    {vendor.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="supplierPartNumber">Supplier Part #</Label>
          <Input
            id="supplierPartNumber"
            name="supplierPartNumber"
            value={formData.supplierPartNumber}
            onChange={onChange}
            placeholder="Enter supplier part #"
            data-testid="input-supplierPartNumber"
          />
        </div>
        <div>
          <Label htmlFor="secondarySource">Secondary Source</Label>
          <Input
            id="secondarySource"
            name="secondarySource"
            value={formData.secondarySource}
            onChange={onChange}
            placeholder="Enter secondary source"
            data-testid="input-secondarySource"
          />
        </div>
        <div>
          <Label htmlFor="secondarySupplierPartNumber">Secondary Supplier Part #</Label>
          <Input
            id="secondarySupplierPartNumber"
            name="secondarySupplierPartNumber"
            value={formData.secondarySupplierPartNumber}
            onChange={onChange}
            placeholder="Enter secondary supplier part #"
            data-testid="input-secondarySupplierPartNumber"
          />
        </div>
        <div>
          <Label htmlFor="vendorUnit">Vendor Unit</Label>
          <Select
            value={formData.vendorUnit}
            onValueChange={(value) => onSelectChange('vendorUnit', value)}
          >
            <SelectTrigger id="vendorUnit" data-testid="select-vendorUnit">
              <SelectValue placeholder="Select unit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BOX">BOX</SelectItem>
              <SelectItem value="CASE">CASE</SelectItem>
              <SelectItem value="PALLET">PALLET</SelectItem>
              <SelectItem value="ROLL">ROLL</SelectItem>
              <SelectItem value="HALFROLL">HALFROLL</SelectItem>
              <SelectItem value="SHEET">SHEET</SelectItem>
              <SelectItem value="BAG">BAG</SelectItem>
              <SelectItem value="DRUM">DRUM</SelectItem>
              <SelectItem value="PAIL">PAIL</SelectItem>
              <SelectItem value="TUBE">TUBE</SelectItem>
              <SelectItem value="GAL">GAL</SelectItem>
              <SelectItem value="LB">LB</SelectItem>
              <SelectItem value="KG">KG</SelectItem>
              <SelectItem value="EA">EA</SelectItem>
              <SelectItem value="FT">FT</SelectItem>
              <SelectItem value="M">M</SelectItem>
              <SelectItem value="SQM">SQM</SelectItem>
              <SelectItem value="HR">HR</SelectItem>
              <SelectItem value="MIN">MIN</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 mt-1">
            Machine-friendly unit (e.g., "BOX", "GAL", "EA")
          </p>
        </div>
        <div>
          <Label htmlFor="purchaseUnitId">Purchase Unit</Label>
          <Select
            value={formData.purchaseUnitId || ''}
            onValueChange={(value) => {
              const unit = allUnits.find(u => u.id.toString() === value);
              onSelectChange('purchaseUnitId', value);
              if (unit) onSelectChange('purchaseUnit', unit.symbol);
            }}
          >
            <SelectTrigger id="purchaseUnitId" data-testid="select-purchaseUnitId">
              <SelectValue placeholder="Select unit" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(unitsByFamily).map(([family, units]) => (
                <SelectGroup key={family}>
                  <SelectLabel className="capitalize">{family}</SelectLabel>
                  {units.map(u => (
                    <SelectItem key={u.id} value={u.id.toString()}>{u.symbol}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 mt-1">Measurement unit for purchasing (must match usage unit family)</p>
        </div>
        <div>
          <Label htmlFor="purchaseQuantity">Purchase Quantity</Label>
          <Input
            id="purchaseQuantity"
            name="purchaseQuantity"
            type="number"
            step="0.01"
            value={formData.purchaseQuantity}
            onChange={onChange}
            placeholder="80"
            data-testid="input-purchaseQuantity"
          />
          <p className="text-xs text-gray-500 mt-1">
            Quantity per vendor unit (e.g., 80)
          </p>
        </div>
        <div>
          <Label htmlFor="costPer">Purchase Cost ($)</Label>
          <Input
            id="costPer"
            name="costPer"
            type="number"
            step="0.01"
            value={formData.costPer}
            onChange={onChange}
            placeholder="491.20"
            data-testid="input-costPer"
          />
          <p className="text-xs text-gray-500 mt-1">
            Cost from vendor (e.g., $491.20 for 80lb box)
          </p>
        </div>
        <div>
          <Label htmlFor="orderDate">Order Date</Label>
          <Input
            id="orderDate"
            name="orderDate"
            type="date"
            value={formData.orderDate}
            onChange={onChange}
            data-testid="input-orderDate"
          />
        </div>
        <div>
          <Label htmlFor="leadTimeDays">Lead Time</Label>
          <Input
            id="leadTimeDays"
            name="leadTimeDays"
            value={formData.leadTimeDays}
            onChange={onChange}
            placeholder="e.g., 3 days, 4 weeks, 2 months"
            data-testid="input-leadTimeDays"
          />
          <p className="text-xs text-gray-500 mt-1">
            Lead time for forecasting/MRP calculations
          </p>
        </div>
        <div>
          <Label htmlFor="defaultOrderMethod">Default Order Method</Label>
          <Select
            value={formData.defaultOrderMethod || 'none'}
            onValueChange={(value) => onSelectChange('defaultOrderMethod', value === 'none' ? '' : value)}
          >
            <SelectTrigger data-testid="select-defaultOrderMethod">
              <SelectValue placeholder="Select default order method (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="PO">PO</SelectItem>
              <SelectItem value="WEBSITE">Website</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 mt-1">Default procurement method for new parts requests</p>
        </div>
      </div>
    </div>

    {/* Section 3 — Manufacturing Usage */}
    <div className="space-y-4">
      <h4 className="text-md font-semibold border-b pb-2">Manufacturing Usage</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="consumptionRate">Usage Per Item</Label>
          <Input
            id="consumptionRate"
            name="consumptionRate"
            type="number"
            step="0.01"
            value={formData.consumptionRate}
            onChange={onChange}
            placeholder="50"
            data-testid="input-consumptionRate"
          />
          <p className="text-xs text-gray-500 mt-1">Amount of this material required to produce one finished unit</p>
        </div>
        <div>
          <Label htmlFor="usageUnitId">Usage Unit</Label>
          <Select
            value={formData.usageUnitId || ''}
            onValueChange={(value) => {
              const unit = allUnits.find(u => u.id.toString() === value);
              onSelectChange('usageUnitId', value);
              if (unit) onSelectChange('usageUnit', unit.symbol);
            }}
          >
            <SelectTrigger id="usageUnitId" data-testid="select-usageUnit">
              <SelectValue placeholder="Select unit" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(unitsByFamily).map(([family, units]) => (
                <SelectGroup key={family}>
                  <SelectLabel className="capitalize">{family}</SelectLabel>
                  {units.map(u => (
                    <SelectItem key={u.id} value={u.id.toString()}>{u.symbol}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 mt-1">
            Unit of measurement (e.g., "g", "oz", "ea")
          </p>
        </div>
      </div>
    </div>

    {/* Section 4 — Calculated Values */}
    <div className="space-y-4">
      <h4 className="text-md font-semibold border-b pb-2">Calculated Values</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Cost per Usage Unit</Label>
          <div
            className="mt-1 flex items-center h-9 px-3 rounded-md border border-input bg-muted text-sm font-medium"
            data-testid="display-costPerUsageUnit"
          >
            {(() => {
              const costPer = parseFloat(formData.costPer);
              const purchaseQty = parseFloat(formData.purchaseQuantity);
              if (!costPer || !purchaseQty || isNaN(costPer) || isNaN(purchaseQty)) {
                return <span className="text-muted-foreground">—</span>;
              }
              const val = costPer / purchaseQty;
              const unit = formData.usageUnit || '';
              return `$${val.toFixed(4)}${unit ? ` / ${unit}` : ''}`;
            })()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Purchase Cost ÷ Purchase Quantity</p>
        </div>
        <div>
          <Label>COGS per Item</Label>
          <div
            className="mt-1 flex items-center h-9 px-3 rounded-md border border-input bg-muted text-sm font-medium"
            data-testid="display-cogsPerUnit"
          >
            {formData.cogsPerUnit
              ? `$${parseFloat(formData.cogsPerUnit).toFixed(4)}`
              : <span className="text-muted-foreground">—</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Cost per Usage Unit × Usage Per Item</p>
        </div>
      </div>
    </div>

    {/* Additional Information Section */}
    <div className="space-y-4">
      <h4 className="text-md font-semibold border-b pb-2">
        Additional Information
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Label htmlFor="assignedDepartments">Assigned Departments *</Label>
          <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
            {departments.map((dept) => (
              <div key={dept.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`dept-${dept.id}`}
                  checked={formData.assignedDepartments.includes(dept.name)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onMultiSelectChange('assignedDepartments', [
                        ...formData.assignedDepartments,
                        dept.name,
                      ]);
                    } else {
                      onMultiSelectChange(
                        'assignedDepartments',
                        formData.assignedDepartments.filter((d) => d !== dept.name)
                      );
                    }
                  }}
                  data-testid={`checkbox-dept-${dept.name}`}
                />
                <Label
                  htmlFor={`dept-${dept.id}`}
                  className="cursor-pointer font-normal"
                >
                  {dept.name}
                </Label>
              </div>
            ))}
          </div>
          {formData.assignedDepartments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.assignedDepartments.map((dept) => (
                <Badge key={dept} variant="secondary">
                  {dept}
                </Badge>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Select which departments can request and use this part
          </p>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="assignedToAsset">Assigned to Asset</Label>
          <Select
            value={formData.assignedToAsset || 'none'}
            onValueChange={(value) => onSelectChange('assignedToAsset', value === 'none' ? '' : value)}
          >
            <SelectTrigger data-testid="select-assignedToAsset">
              <SelectValue placeholder="Select asset (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {assets
                .filter((a) => a.status !== 'retired')
                .map((asset) => (
                  <SelectItem key={asset.id} value={`${asset.name} (${asset.assetTag})`}>
                    {asset.name} ({asset.assetTag})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 mt-1">Assign this item to a specific asset/equipment</p>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={onChange}
            placeholder="Enter notes"
            rows={3}
            data-testid="textarea-notes"
          />
        </div>
      </div>
    </div>

    {/* Safety Data Sheet Section */}
    <div className="space-y-4">
      <h4 className="text-md font-semibold border-b pb-2">
        Safety Data Sheet
      </h4>
      <div className="grid grid-cols-1 gap-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="hasSds"
            checked={formData.hasSds}
            onCheckedChange={(checked) =>
              onCheckboxChange('hasSds', checked as boolean)
            }
            data-testid="checkbox-hasSds"
          />
          <Label htmlFor="hasSds" className="cursor-pointer">
            SDS (Safety Data Sheet available)
          </Label>
        </div>
        {formData.hasSds && (
          <div>
            <Label htmlFor="sdsFile">Upload SDS PDF</Label>
            <Input
              id="sdsFile"
              name="sdsFile"
              type="file"
              accept=".pdf"
              onChange={onFileChange}
              data-testid="input-sdsFile"
              className="cursor-pointer"
            />
            {currentSdsFileName && !sdsFile && (
              <p className="text-xs text-green-600 mt-1">
                Current file: {currentSdsFileName}
              </p>
            )}
            {sdsFile && (
              <p className="text-xs text-blue-600 mt-1">
                New file selected: {sdsFile.name}
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Upload a PDF file of the Safety Data Sheet
            </p>
          </div>
        )}
      </div>
    </div>

    {/* Technical Data Sheet Section */}
    <div className="space-y-4">
      <h4 className="text-md font-semibold border-b pb-2">
        Technical Data Sheet
      </h4>
      <div className="grid grid-cols-1 gap-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="hasTds"
            checked={formData.hasTds}
            onCheckedChange={(checked) =>
              onCheckboxChange('hasTds', checked as boolean)
            }
            data-testid="checkbox-hasTds"
          />
          <Label htmlFor="hasTds" className="cursor-pointer">
            TDS (Technical Data Sheet available)
          </Label>
        </div>
        {formData.hasTds && (
          <div>
            <Label htmlFor="tdsFile">Upload TDS PDF</Label>
            <Input
              id="tdsFile"
              name="tdsFile"
              type="file"
              accept=".pdf"
              onChange={onFileChange}
              data-testid="input-tdsFile"
              className="cursor-pointer"
            />
            {currentTdsFileName && !tdsFile && (
              <p className="text-xs text-green-600 mt-1">
                Current file: {currentTdsFileName}
              </p>
            )}
            {tdsFile && (
              <p className="text-xs text-blue-600 mt-1">
                New file selected: {tdsFile.name}
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Upload a PDF file of the Technical Data Sheet
            </p>
          </div>
        )}
      </div>
    </div>

    {/* Other Documents Section */}
    <div className="space-y-4">
      <h4 className="text-md font-semibold border-b pb-2">
        Other Documents
      </h4>
      <div className="grid grid-cols-1 gap-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="hasOtherDocs"
            checked={formData.hasOtherDocs}
            onCheckedChange={(checked) =>
              onCheckboxChange('hasOtherDocs', checked as boolean)
            }
            data-testid="checkbox-hasOtherDocs"
          />
          <Label htmlFor="hasOtherDocs" className="cursor-pointer">
            Other Docs (Other documentation available)
          </Label>
        </div>
        {formData.hasOtherDocs && (
          <div>
            <Label htmlFor="otherDocsFile">Upload Other Docs PDF</Label>
            <Input
              id="otherDocsFile"
              name="otherDocsFile"
              type="file"
              accept=".pdf"
              onChange={onFileChange}
              data-testid="input-otherDocsFile"
              className="cursor-pointer"
            />
            {currentOtherDocsFileName && !otherDocsFile && (
              <p className="text-xs text-green-600 mt-1">
                Current file: {currentOtherDocsFileName}
              </p>
            )}
            {otherDocsFile && (
              <p className="text-xs text-blue-600 mt-1">
                New file selected: {otherDocsFile.name}
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Upload a PDF file of other documentation
            </p>
          </div>
        )}
      </div>
    </div>

    <div className="flex justify-end space-x-2 pt-4 border-t">
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        data-testid="button-cancel"
      >
        Cancel
      </Button>
      <Button
        type="submit"
        disabled={isCreatePending || isUpdatePending}
        data-testid="button-submit"
      >
        {editingItem ? 'Update' : 'Create'} Item
      </Button>
    </div>

    <TraceabilityConfigModal
      isOpen={isTraceabilityModalOpen}
      onClose={onCloseTraceabilityModal}
      onSave={onSaveTraceabilityFields}
      initialFields={formData.traceabilityFields}
    />
  </form>
  );
};

interface InventoryItemsCardProps {
  initialSearchTerm?: string | null;
}

const inventoryFormSchema = z.object({
  agPartNumber: z.string().min(1, 'AG Part# is required'),
  name: z.string().min(1, 'Name is required'),
  itemType: z.enum(['PURCHASED', 'MANUFACTURED']).optional().nullable(),
  manufacturedCategory: z.enum(['PACKET', 'KIT', 'MACHINED_PART', 'CORE', 'SUB_ASSEMBLY', 'ASSEMBLY', 'COMPOSITE', 'COMPONENT']).optional().nullable(),
}).refine(
  (data) => {
    if (data.itemType === 'MANUFACTURED') return !!data.manufacturedCategory;
    return true;
  },
  { message: 'Manufactured items require a category. Please select a Manufactured Category.', path: ['manufacturedCategory'] }
).refine(
  (data) => {
    if (data.itemType === 'PURCHASED') return !data.manufacturedCategory;
    return true;
  },
  { message: 'Purchased items must not have a manufactured category.', path: ['manufacturedCategory'] }
);

export default function InventoryItemsCard({ initialSearchTerm }: InventoryItemsCardProps = {}) {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [replaceAllItems, setReplaceAllItems] = useState(false);
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');
  const [utilizedFilter, setUtilizedFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'purchased' | 'manufactured'>('purchased');
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [isAddToGroupDialogOpen, setIsAddToGroupDialogOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Bulk update utilized fields state
  const [isBulkUtilizedDialogOpen, setIsBulkUtilizedDialogOpen] =
    useState(false);
  const [bulkUtilizedFields, setBulkUtilizedFields] = useState({
    utilizedInPL1: false,
    utilizedInPL2: false,
    utilizedInPL3: false,
    utilizedInFacilities: false,
    utilizedInAdmin: false,
    utilizedInServices: false,
  });

  const [formData, setFormData] = useState<InventoryFormData>({
    agPartNumber: '',
    sku: '',
    name: '',
    type: 'Purchased',
    itemType: 'PURCHASED',
    manufacturedCategory: '',
    manufacturingLevel: '',
    manufacturingDepartment: '',
    machineType: '',
    source: '',
    vendorId: 'none',
    supplierPartNumber: '',
    secondarySupplierPartNumber: '',
    costPer: '',
    vendorUnit: '',
    purchaseUnitLabel: '',
    purchaseUnit: '',
    purchaseQuantity: '',
    consumptionRate: '',
    usageUnit: '',
    purchaseUnitId: '',
    usageUnitId: '',
    cogsPerUnit: '',
    orderDate: '',
    department: '',
    assignedDepartments: [],
    leadTimeDays: '',
    secondarySource: '',
    notes: '',
    isStockItem: false,
    utilizedInPL1: false,
    utilizedInPL2: false,
    utilizedInPL3: false,
    traceabilityRequired: false,
    traceabilityFields: [],
    utilizedInFacilities: false,
    utilizedInAdmin: false,
    utilizedInServices: false,
    isPacket: false,
    isFabric: false,
    hasSds: false,
    hasTds: false,
    hasOtherDocs: false,
    assignedToAsset: '',
    defaultOrderMethod: '',
  });

  const [sdsFile, setSdsFile] = useState<File | null>(null);
  const [currentSdsFileName, setCurrentSdsFileName] = useState<string | null>(null);
  const [tdsFile, setTdsFile] = useState<File | null>(null);
  const [currentTdsFileName, setCurrentTdsFileName] = useState<string | null>(null);
  const [otherDocsFile, setOtherDocsFile] = useState<File | null>(null);
  const [currentOtherDocsFileName, setCurrentOtherDocsFileName] = useState<string | null>(null);
  const [isTraceabilityModalOpen, setIsTraceabilityModalOpen] = useState(false);

  // Sync legacy department field with first assigned department
  useEffect(() => {
    const firstDepartment = formData.assignedDepartments[0] || '';
    if (formData.department !== firstDepartment) {
      setFormData((prev) => ({
        ...prev,
        department: firstDepartment,
      }));
    }
  }, [formData.assignedDepartments, formData.department]);

  // Auto-calculate COGS per unit when conversion data changes
  useEffect(() => {
    const {
      costPer,
      purchaseQuantity,
      purchaseUnit,
      consumptionRate,
      usageUnit,
    } = formData;

    // purchaseUnit is hidden from the UI — fall back to usageUnit so COGS still
    // calculates correctly when the two units share the same measurement family.
    const effectivePurchaseUnit = purchaseUnit || usageUnit;

    // Only calculate if we have all required fields
    if (
      costPer &&
      purchaseQuantity &&
      effectivePurchaseUnit &&
      consumptionRate &&
      usageUnit
    ) {
      const vendorPrice = parseFloat(costPer);
      const purQty = parseFloat(purchaseQuantity);
      const consRate = parseFloat(consumptionRate);

      const calculatedCOGS = calculateCOGS(
        vendorPrice,
        purQty,
        effectivePurchaseUnit,
        consRate,
        usageUnit
      );

      if (calculatedCOGS !== null && !isNaN(calculatedCOGS)) {
        // Only update if the calculated value is different (to avoid infinite loops)
        const currentCOGS = formData.cogsPerUnit
          ? parseFloat(formData.cogsPerUnit)
          : 0;
        const roundedCOGS = Math.round(calculatedCOGS * 100) / 100; // Round to 2 decimal places

        if (Math.abs(currentCOGS - roundedCOGS) > 0.001) {
          setFormData((prev) => ({
            ...prev,
            cogsPerUnit: roundedCOGS.toFixed(2),
          }));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formData.costPer,
    formData.purchaseQuantity,
    formData.purchaseUnit,
    formData.consumptionRate,
    formData.usageUnit,
  ]);

  const { data: allItems = [], isLoading, isError, error } = useQuery<InventoryItem[]>({
    queryKey: ['/api/enhanced/inventory/items'],
    queryFn: () => apiRequest('/api/enhanced/inventory/items'),
  });

  React.useEffect(() => {
    if (isError && error) {
      console.error('Inventory items fetch error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('401') || errorMessage.includes('No session') || errorMessage.includes('authentication')) {
        toast.error('Please log in to view inventory items');
      } else if (errorMessage.includes('timeout')) {
        toast.error('Request timed out. Please refresh the page to try again.');
      } else {
        toast.error(`Failed to load inventory items: ${errorMessage}`);
      }
    }
  }, [isError, error]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: vendorsResponse } = useQuery<{ data: any[] }>({
    queryKey: ['/api/vendors'],
  });

  const vendors = vendorsResponse?.data || [];

  const { data: assets = [] } = useQuery<{ id: string; assetTag: string; name: string; status: string }[]>({
    queryKey: ['/api/assets'],
  });

  // Fetch departments
  const { data: departments = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['/api/inventory/departments'],
  });

  // Fetch all item groups
  const { data: allGroups = [] } = useQuery<ItemGroup[]>({
    queryKey: ['/api/inventory/groups'],
    queryFn: () => apiRequest('/api/inventory/groups'),
  });

  // Fetch item-group mappings in bulk (single API call)
  const { data: itemGroupsMap = {} } = useQuery<Record<number, ItemGroup[]>>({
    queryKey: ['/api/inventory/items-groups-map'],
    queryFn: () => apiRequest('/api/inventory/items-groups-map'),
  });

  const { data: balancesData } = useQuery<{ balances: Array<{ agPartNumber: string; quantityOnHand: number }> }>({
    queryKey: ['/api/enhanced/inventory/balances'],
  });

  const balancesByPart = React.useMemo(() => {
    const map: Record<string, number> = {};
    if (balancesData?.balances) {
      for (const b of balancesData.balances) {
        map[b.agPartNumber] = (map[b.agPartNumber] || 0) + b.quantityOnHand;
      }
    }
    return map;
  }, [balancesData]);

  const [, navigateTo] = useLocation();

  // Routing query — only for manufactured items in the edit dialog
  const editingItemId = editingItem?.id ?? null;
  const isManufactured = editingItem?.itemType === 'MANUFACTURED';

  const {
    data: itemRouting,
    isLoading: isRoutingLoading,
    refetch: refetchRouting,
  } = useQuery<any>({
    queryKey: ['/api/inventory/items', editingItemId, 'routing'],
    queryFn: () => apiRequest(`/api/inventory/items/${editingItemId}/routing`),
    enabled: !!editingItemId && isManufactured && isEditOpen,
    staleTime: 0,
  });

  // Routing creation mode: null = show buttons, 'blank' | 'template' | 'link'
  const [routingCreateMode, setRoutingCreateMode] = useState<'template' | 'link' | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedExistingRoutingId, setSelectedExistingRoutingId] = useState('');

  const createRoutingMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/inventory/items/${editingItemId}/routing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createdBy: 'system' }),
      }),
    onSuccess: () => {
      toast.success('Routing created successfully');
      refetchRouting();
    },
    onError: (err: any) => {
      const msg = err?.message || 'Failed to create routing';
      toast.error(msg);
    },
  });

  const { data: routingTemplatesList = [], isLoading: isTemplatesLoading } = useQuery<any[]>({
    queryKey: ['/api/inventory/items', editingItemId, 'routing-templates'],
    queryFn: () => apiRequest(`/api/inventory/items/${editingItemId}/routing-templates`),
    enabled: !!editingItemId && isManufactured && routingCreateMode === 'template',
    retry: false,
  });

  const { data: availableRoutingsList = [], isLoading: isAvailableRoutingsLoading } = useQuery<any[]>({
    queryKey: ['/api/inventory/items', editingItemId, 'available-routings'],
    queryFn: () => apiRequest(`/api/inventory/items/${editingItemId}/available-routings`),
    enabled: !!editingItemId && isManufactured && routingCreateMode === 'link',
    retry: false,
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/inventory/items/${editingItemId}/routing-from-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplateId, createdBy: 'system' }),
      }),
    onSuccess: () => {
      toast.success('Routing created from template');
      setRoutingCreateMode(null);
      setSelectedTemplateId('');
      refetchRouting();
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to create routing from template');
    },
  });

  const linkExistingRoutingMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/inventory/items/${editingItemId}/routing-link`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routingId: selectedExistingRoutingId }),
      }),
    onSuccess: () => {
      toast.success('Routing linked successfully');
      setRoutingCreateMode(null);
      setSelectedExistingRoutingId('');
      refetchRouting();
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to link routing');
    },
  });

  // Type-filtered item sets for tab counts and tab filtering
  const purchasedItems = Array.isArray(allItems)
    ? allItems.filter(
        (item) =>
          item.itemType === 'PURCHASED' ||
          (!item.itemType && item.type !== 'Manufactured' && !item.isPacket)
      )
    : [];

  const manufacturedItems = Array.isArray(allItems)
    ? allItems.filter(
        (item) =>
          item.itemType === 'MANUFACTURED' ||
          item.type === 'Manufactured' ||
          item.isPacket
      )
    : [];

  // Group manufactured items by category for accordion view
  const groupedManufactured = React.useMemo(() => {
    return MANUFACTURED_CATEGORY_ORDER.reduce((acc, cat) => {
      acc[cat] = manufacturedItems.filter((item) => {
        if (item.manufacturedCategory === cat) return true;
        if (!item.manufacturedCategory && cat === 'PACKET' && item.isPacket) return true;
        return false;
      });
      return acc;
    }, {} as Record<ManufacturedCategory, InventoryItem[]>);
  }, [manufacturedItems]);

  const uncategorizedManufactured = React.useMemo(() => {
    return manufacturedItems.filter((item) => !item.manufacturedCategory && !item.isPacket);
  }, [manufacturedItems]);

  // Sort handler function
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const tabItems = activeTab === 'purchased' ? purchasedItems : manufacturedItems;

  const items = Array.isArray(allItems)
    ? tabItems
        .filter((item) => {
          // Search filter
          if (searchTerm.trim()) {
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch =
              item.agPartNumber.toLowerCase().includes(searchLower) ||
              item.name.toLowerCase().includes(searchLower) ||
              (item.sku && item.sku.toLowerCase().includes(searchLower)) ||
              (item.source &&
                item.source.toLowerCase().includes(searchLower)) ||
              (item.supplierPartNumber &&
                item.supplierPartNumber.toLowerCase().includes(searchLower)) ||
              (item.department &&
                item.department.toLowerCase().includes(searchLower)) ||
              (item.notes && item.notes.toLowerCase().includes(searchLower));
            if (!matchesSearch) return false;
          }

          // Utilized filter
          if (utilizedFilter !== 'all') {
            switch (utilizedFilter) {
              case 'pl1':
                return item.utilizedInPL1;
              case 'pl2':
                return item.utilizedInPL2;
              case 'pl3':
                return item.utilizedInPL3;
              case 'facilities':
                return item.utilizedInFacilities;
              case 'admin':
                return item.utilizedInAdmin;
              case 'services':
                return item.utilizedInServices;
              default:
                return true;
            }
          }

          return true;
        })
        .sort((a, b) => {
          if (!sortColumn) return 0;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let aValue: any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let bValue: any;

          switch (sortColumn) {
            case 'agPartNumber':
              aValue = a.agPartNumber || '';
              bValue = b.agPartNumber || '';
              break;
            case 'sku':
              aValue = a.sku || '';
              bValue = b.sku || '';
              break;
            case 'name':
              aValue = a.name || '';
              bValue = b.name || '';
              break;
            case 'source':
              aValue = a.source || '';
              bValue = b.source || '';
              break;
            case 'supplierPartNumber':
              aValue = a.supplierPartNumber || '';
              bValue = b.supplierPartNumber || '';
              break;
            case 'secondarySource':
              aValue = a.secondarySource || '';
              bValue = b.secondarySource || '';
              break;
            case 'costPer':
              aValue = a.costPer || 0;
              bValue = b.costPer || 0;
              break;
            case 'currentQty':
              aValue = balancesByPart[a.agPartNumber] || 0;
              bValue = balancesByPart[b.agPartNumber] || 0;
              break;
            default:
              return 0;
          }

          if (typeof aValue === 'string') {
            const comparison = aValue.localeCompare(bValue);
            return sortDirection === 'asc' ? comparison : -comparison;
          } else {
            const comparison = aValue - bValue;
            return sortDirection === 'asc' ? comparison : -comparison;
          }
        })
    : [];

  const createMutation = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async ({ data, sdsFile, tdsFile, otherDocsFile }: { data: any; sdsFile: File | null; tdsFile: File | null; otherDocsFile: File | null }) => {
      const formData = new FormData();
      formData.append('data', JSON.stringify(data));
      if (sdsFile) {
        formData.append('sdsFile', sdsFile);
      }
      if (tdsFile) {
        formData.append('tdsFile', tdsFile);
      }
      if (otherDocsFile) {
        formData.append('otherDocsFile', otherDocsFile);
      }
      
      const response = await fetch('/api/inventory/items', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Failed to create inventory item');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast.success('Inventory item created successfully');
      setIsCreateOpen(false);
      resetForm();
      queryClient.invalidateQueries({
        queryKey: ['/api/enhanced/inventory/items'],
      });
    },
    onError: () => toast.error('Failed to create inventory item'),
  });

  const updateMutation = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async ({ id, data, sdsFile, tdsFile, otherDocsFile }: { id: number; data: any; sdsFile: File | null; tdsFile: File | null; otherDocsFile: File | null }) => {
      const formData = new FormData();
      formData.append('data', JSON.stringify(data));
      if (sdsFile) {
        formData.append('sdsFile', sdsFile);
      }
      if (tdsFile) {
        formData.append('tdsFile', tdsFile);
      }
      if (otherDocsFile) {
        formData.append('otherDocsFile', otherDocsFile);
      }
      
      const response = await fetch(`/api/inventory/items/${id}`, {
        method: 'PUT',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Failed to update inventory item');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast.success('Inventory item updated successfully');
      setIsEditOpen(false);
      setEditingItem(null);
      resetForm();
      setRoutingCreateMode(null);
      setSelectedTemplateId('');
      setSelectedExistingRoutingId('');
      queryClient.invalidateQueries({
        queryKey: ['/api/enhanced/inventory/items'],
      });
    },
    onError: () => toast.error('Failed to update inventory item'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/inventory/items/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast.success('Inventory item deleted successfully');
      queryClient.invalidateQueries({
        queryKey: ['/api/enhanced/inventory/items'],
      });
    },
    onError: () => toast.error('Failed to delete inventory item'),
  });

  const handleExportCSV = async () => {
    try {
      const response = await fetch('/api/enhanced/inventory/export/csv');
      if (!response.ok) {
        throw new Error('Failed to export CSV');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `inventory_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Inventory exported successfully');
    } catch (error) {
      console.error('CSV export error:', error);
      toast.error('Failed to export inventory');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
    }
  };

  const handleImportCSV = async () => {
    if (!importFile) {
      toast.error('Please select a CSV file');
      return;
    }

    try {
      const csvData = await importFile.text();

      const response = await apiRequest(
        '/api/enhanced/inventory/import/csv?replaceAll=' + replaceAllItems,
        {
          method: 'POST',
          body: { csvData },
        }
      );

      if (response.success) {
        const message = `Successfully imported ${response.importedCount} items${response.skippedCount ? ` (${response.skippedCount} rows skipped)` : ''}`;
        toast.success(message);

        if (response.errors && response.errors.length > 0) {
          console.warn('Import errors:', response.errors);
          const errorMessage =
            response.errors.slice(0, 3).join(', ') +
            (response.errors.length > 3
              ? ` and ${response.errors.length - 3} more...`
              : '');
          toast.error(
            `${response.errors.length} rows had errors: ${errorMessage}`,
            { duration: 6000 }
          );
        }

        if (response.skippedRows && response.skippedRows.length > 0) {
          console.info('Skipped rows:', response.skippedRows);
        }

        setIsImportDialogOpen(false);
        setImportFile(null);
        setReplaceAllItems(false);
        const fileInput = document.getElementById(
          'csvFile'
        ) as HTMLInputElement;
        if (fileInput) {
          fileInput.value = '';
        }
        queryClient.invalidateQueries({
          queryKey: ['/api/enhanced/inventory/items'],
        });
      } else {
        // Handle validation errors from backend
        const errorMsg = response.error || 'Import failed';
        toast.error(errorMsg, { duration: 8000 });

        if (response.validationErrors && response.validationErrors.length > 0) {
          console.error('Validation errors:', response.validationErrors);
          const details = response.validationErrors.slice(0, 5).join('\n');
          toast.error(
            `Validation errors found:\n${details}${response.validationErrors.length > 5 ? `\n...and ${response.validationErrors.length - 5} more` : ''}`,
            { duration: 10000 }
          );
        }
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error(
        `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  const resetForm = () => {
    setFormData({
      agPartNumber: '',
      sku: '',
      name: '',
      type: 'Purchased',
      itemType: 'PURCHASED',
      manufacturedCategory: '',
      manufacturingLevel: '',
      manufacturingDepartment: '',
      machineType: '',
      source: '',
      vendorId: 'none',
      supplierPartNumber: '',
      secondarySupplierPartNumber: '',
      costPer: '',
      vendorUnit: '',
      purchaseUnitLabel: '',
      purchaseUnit: '',
      purchaseQuantity: '',
      consumptionRate: '',
      usageUnit: '',
      purchaseUnitId: '',
      usageUnitId: '',
      cogsPerUnit: '',
      orderDate: '',
      department: '',
      assignedDepartments: [],
      leadTimeDays: '',
      secondarySource: '',
      notes: '',
      isStockItem: false,
      utilizedInPL1: false,
      utilizedInPL2: false,
      utilizedInPL3: false,
      traceabilityRequired: false,
      traceabilityFields: [],
      utilizedInFacilities: false,
      utilizedInAdmin: false,
      utilizedInServices: false,
      isPacket: false,
      isFabric: false,
      hasSds: false,
      hasTds: false,
      hasOtherDocs: false,
    });
    setSdsFile(null);
    setCurrentSdsFileName(null);
    setTdsFile(null);
    setCurrentTdsFileName(null);
    setOtherDocsFile(null);
    setCurrentOtherDocsFileName(null);
  };

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
    },
    []
  );

  const handleSelectChange = useCallback((name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleMultiSelectChange = useCallback((name: string, values: string[]) => {
    setFormData((prev) => ({ ...prev, [name]: values }));
  }, []);

  const handleCheckboxChange = useCallback((name: string, checked: boolean) => {
    setFormData((prev) => ({ ...prev, [name]: checked }));
  }, []);

  const [wasTraceabilityCheckedBeforeModal, setWasTraceabilityCheckedBeforeModal] = useState(false);

  const handleTraceabilityClick = useCallback(() => {
    setWasTraceabilityCheckedBeforeModal(formData.traceabilityRequired);
    setIsTraceabilityModalOpen(true);
  }, [formData.traceabilityRequired]);

  const handleCloseTraceabilityModal = useCallback(() => {
    setIsTraceabilityModalOpen(false);
    // If modal was opened from a new checkbox click (not previously checked), uncheck on cancel
    if (!wasTraceabilityCheckedBeforeModal) {
      setFormData((prev) => ({
        ...prev,
        traceabilityRequired: false,
      }));
    }
  }, [wasTraceabilityCheckedBeforeModal]);

  const handleSaveTraceabilityFields = useCallback((fields: string[]) => {
    setFormData((prev) => ({
      ...prev,
      traceabilityRequired: true,
      traceabilityFields: fields,
    }));
  }, []);

  const handleSdsFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    const inputName = e.target.name;
    
    if (file && file.type === 'application/pdf') {
      if (inputName === 'sdsFile') {
        setSdsFile(file);
      } else if (inputName === 'tdsFile') {
        setTdsFile(file);
      } else if (inputName === 'otherDocsFile') {
        setOtherDocsFile(file);
      }
    } else if (file) {
      toast.error('Please select a PDF file');
      e.target.value = '';
    }
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const validation = inventoryFormSchema.safeParse({
        agPartNumber: formData.agPartNumber,
        name: formData.name,
        itemType: formData.itemType || (formData.type === 'Manufactured' ? 'MANUFACTURED' : null),
        manufacturedCategory: formData.manufacturedCategory || null,
      });

      if (!validation.success) {
        const firstError = validation.error.errors[0];
        toast.error(firstError?.message || 'Please fill in required fields');
        return;
      }

      const submitData = {
        agPartNumber: formData.agPartNumber,
        sku: formData.sku || null,
        name: formData.name,
        type: formData.type || 'Purchased',
        itemType: (formData.itemType || (formData.type === 'Manufactured' ? 'MANUFACTURED' : 'PURCHASED')) as 'PURCHASED' | 'MANUFACTURED',
        manufacturedCategory: (formData.itemType === 'MANUFACTURED' || formData.type === 'Manufactured') && formData.manufacturedCategory
          ? formData.manufacturedCategory as 'PACKET' | 'KIT' | 'MACHINED_PART' | 'CORE' | 'SUB_ASSEMBLY' | 'ASSEMBLY' | 'COMPOSITE' | 'COMPONENT'
          : null,
        manufacturingLevel: (formData.itemType === 'MANUFACTURED' || formData.type === 'Manufactured') && formData.manufacturingLevel
          ? formData.manufacturingLevel as 'COMPONENT' | 'INTERMEDIATE' | 'FINAL'
          : null,
        manufacturingDepartment: formData.manufacturingDepartment || null,
        isPacket: formData.manufacturedCategory === 'PACKET',
        source: formData.source || null,
        vendorId:
          formData.vendorId && formData.vendorId !== 'none'
            ? parseInt(formData.vendorId)
            : null,
        supplierPartNumber: formData.supplierPartNumber || null,
        secondarySupplierPartNumber:
          formData.secondarySupplierPartNumber || null,
        costPer: formData.costPer !== '' ? parseFloat(formData.costPer) : null,
        vendorUnit: formData.vendorUnit || null,
        purchaseUnitLabel: formData.purchaseUnitLabel || null,
        purchaseUnit: formData.purchaseUnit || formData.usageUnit || null,
        purchaseQuantity: formData.purchaseQuantity
          ? parseFloat(formData.purchaseQuantity)
          : null,
        consumptionRate: formData.consumptionRate
          ? parseFloat(formData.consumptionRate)
          : null,
        usageUnit: formData.usageUnit || null,
        purchaseUnitId: formData.purchaseUnitId ? parseInt(formData.purchaseUnitId) : null,
        usageUnitId: formData.usageUnitId ? parseInt(formData.usageUnitId) : null,
        cogsPerUnit: formData.cogsPerUnit !== ''
          ? parseFloat(formData.cogsPerUnit)
          : null,
        orderDate: formData.orderDate || null,
        department: formData.assignedDepartments.length > 0 ? formData.assignedDepartments[0] : null,
        assignedDepartments: formData.assignedDepartments,
        leadTimeDays: parseLeadTimeToDays(formData.leadTimeDays),
        secondarySource: formData.secondarySource || null,
        notes: formData.notes || null,
        isStockItem: formData.isStockItem,
        utilizedInPL1: formData.utilizedInPL1,
        utilizedInPL2: formData.utilizedInPL2,
        utilizedInPL3: formData.utilizedInPL3,
        traceabilityRequired: formData.traceabilityRequired,
        traceabilityFields: formData.traceabilityFields,
        utilizedInFacilities: formData.utilizedInFacilities,
        utilizedInAdmin: formData.utilizedInAdmin,
        utilizedInServices: formData.utilizedInServices,
        isFabric: formData.isFabric,
        hasSds: formData.hasSds,
        hasTds: formData.hasTds,
        hasOtherDocs: formData.hasOtherDocs,
        assignedToAsset: formData.assignedToAsset || null,
        defaultOrderMethod: formData.defaultOrderMethod || null,
        machineType: formData.manufacturedCategory === 'MACHINED_PART' && formData.machineType
          ? formData.machineType
          : null,
      };

      if (editingItem) {
        updateMutation.mutate({ id: editingItem.id, data: submitData, sdsFile, tdsFile, otherDocsFile });
      } else {
        createMutation.mutate({ data: submitData, sdsFile, tdsFile, otherDocsFile });
      }
    },
    [formData, editingItem, updateMutation, createMutation, sdsFile, tdsFile, otherDocsFile]
  );

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    const resolvedItemType = item.itemType || (item.type === 'Manufactured' ? 'MANUFACTURED' : 'PURCHASED');
    setFormData({
      agPartNumber: item.agPartNumber,
      sku: item.sku || '',
      name: item.name,
      type: item.type || 'Purchased',
      itemType: resolvedItemType,
      manufacturedCategory: item.manufacturedCategory || (item.isPacket ? 'PACKET' : ''),
      manufacturingLevel: item.manufacturingLevel || '',
      manufacturingDepartment: item.manufacturingDepartment || '',
      machineType: item.machineType || '',
      source: item.source || '',
      vendorId: item.vendorId ? item.vendorId.toString() : 'none',
      supplierPartNumber: item.supplierPartNumber || '',
      secondarySupplierPartNumber: item.secondarySupplierPartNumber || '',
      costPer: item.costPer != null ? item.costPer.toString() : '',
      vendorUnit: item.vendorUnit || '',
      purchaseUnitLabel: item.purchaseUnitLabel || '',
      purchaseUnit: item.purchaseUnit || '',
      purchaseUnitId: (item as any).purchaseUnitId?.toString() || '',
      purchaseQuantity: item.purchaseQuantity
        ? item.purchaseQuantity.toString()
        : '',
      consumptionRate: item.consumptionRate
        ? item.consumptionRate.toString()
        : '',
      usageUnit: item.usageUnit || '',
      usageUnitId: (item as any).usageUnitId?.toString() || '',
      cogsPerUnit: item.cogsPerUnit != null ? item.cogsPerUnit.toString() : '',
      orderDate: item.orderDate
        ? new Date(item.orderDate).toISOString().split('T')[0]
        : '',
      department: item.department || '',
      assignedDepartments: (item as any).assignedDepartments || [],
      leadTimeDays: item.leadTimeDays ? item.leadTimeDays.toString() : '',
      secondarySource: item.secondarySource || '',
      notes: item.notes || '',
      isStockItem: item.isStockItem || false,
      utilizedInPL1: item.utilizedInPL1 || false,
      utilizedInPL2: item.utilizedInPL2 || false,
      utilizedInPL3: item.utilizedInPL3 || false,
      traceabilityRequired: item.traceabilityRequired || false,
      traceabilityFields: (item as any).traceabilityFields || [],
      utilizedInFacilities: item.utilizedInFacilities || false,
      utilizedInAdmin: item.utilizedInAdmin || false,
      utilizedInServices: item.utilizedInServices || false,
      isPacket: (item as any).isPacket || false,
      isFabric: item.isFabric || false,
      hasSds: item.hasSds || false,
      hasTds: item.hasTds || false,
      hasOtherDocs: item.hasOtherDocs || false,
      assignedToAsset: (item as any).assignedToAsset || '',
      defaultOrderMethod: (item as any).defaultOrderMethod || '',
    });
    setSdsFile(null);
    setCurrentSdsFileName(item.sdsFilePath ? item.sdsFilePath.split('/').pop() || null : null);
    setTdsFile(null);
    setCurrentTdsFileName(item.tdsFilePath ? item.tdsFilePath.split('/').pop() || null : null);
    setOtherDocsFile(null);
    setCurrentOtherDocsFileName(item.otherDocsFilePath ? item.otherDocsFilePath.split('/').pop() || null : null);
    setIsEditOpen(true);
  };

  const handleDelete = (id: number) => {
    if (
      window.confirm('Are you sure you want to delete this inventory item?')
    ) {
      deleteMutation.mutate(id);
    }
  };

  // Checkbox selection handlers
  const toggleSelectItem = (itemId: number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map((item) => item.id)));
    }
  };

  // Add items to group mutation
  const addToGroupMutation = useMutation({
    mutationFn: async ({
      groupId,
      itemIds,
    }: {
      groupId: number;
      itemIds: number[];
    }) => {
      await apiRequest(`/api/inventory/groups/${groupId}/items`, {
        method: 'POST',
        body: JSON.stringify({ itemIds }),
      });
    },
    onSuccess: () => {
      toast.success('Items added to group successfully');
      setIsAddToGroupDialogOpen(false);
      setSelectedGroupId('');
      setSelectedItems(new Set());
      // Invalidate both the items-groups map and the base items query to update the UI
      queryClient.invalidateQueries({
        queryKey: ['/api/inventory/items-groups-map'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/enhanced/inventory/items'],
      });
    },
    onError: () => {
      toast.error('Failed to add items to group');
    },
  });

  const handleAddToGroup = () => {
    if (!selectedGroupId) {
      toast.error('Please select a group');
      return;
    }

    if (selectedItems.size === 0) {
      toast.error('Please select at least one item');
      return;
    }

    addToGroupMutation.mutate({
      groupId: parseInt(selectedGroupId),
      itemIds: Array.from(selectedItems),
    });
  };

  // Bulk update utilized fields mutation
  const bulkUpdateUtilizedMutation = useMutation({
    mutationFn: async ({
      itemIds,
      utilizedFields,
    }: {
      itemIds: number[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      utilizedFields: any;
    }) => {
      await apiRequest('/api/enhanced/items/bulk-update-utilized', {
        method: 'POST',
        body: { itemIds, utilizedFields },
      });
    },
    onSuccess: () => {
      toast.success('Items updated successfully');
      setIsBulkUtilizedDialogOpen(false);
      setBulkUtilizedFields({
        utilizedInPL1: false,
        utilizedInPL2: false,
        utilizedInPL3: false,
        utilizedInFacilities: false,
        utilizedInAdmin: false,
        utilizedInServices: false,
      });
      setSelectedItems(new Set());
      queryClient.invalidateQueries({
        queryKey: ['/api/enhanced/inventory/items'],
      });
    },
    onError: () => {
      toast.error('Failed to update items');
    },
  });

  // Handler for bulk utilized update
  const handleBulkUtilizedUpdate = () => {
    if (selectedItems.size === 0) {
      toast.error('Please select at least one item');
      return;
    }

    // Send ALL fields - this is a REPLACEMENT operation
    // All selected items will have their utilization flags set to exactly match the dialog
    const fieldsToUpdate = {
      utilizedInPL1: bulkUtilizedFields.utilizedInPL1,
      utilizedInPL2: bulkUtilizedFields.utilizedInPL2,
      utilizedInPL3: bulkUtilizedFields.utilizedInPL3,
      utilizedInFacilities: bulkUtilizedFields.utilizedInFacilities,
      utilizedInAdmin: bulkUtilizedFields.utilizedInAdmin,
      utilizedInServices: bulkUtilizedFields.utilizedInServices,
    };

    bulkUpdateUtilizedMutation.mutate({
      itemIds: Array.from(selectedItems),
      utilizedFields: fieldsToUpdate,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold">Inventory Items</h3>
          <Link href="/manage-groups">
            <Button
              variant="ghost"
              size="sm"
              className="text-blue-600 hover:text-blue-700"
              data-testid="link-manage-groups"
            >
              <Package className="h-4 w-4 mr-2" />
              Manage Groups
            </Button>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {selectedItems.size > 0 && (
            <>
              <Button
                variant="default"
                onClick={() => setIsAddToGroupDialogOpen(true)}
                className="flex items-center gap-2"
                data-testid="button-add-to-group"
              >
                <Package className="h-4 w-4" />
                Add to Group ({selectedItems.size})
              </Button>

              <Button
                variant="secondary"
                onClick={() => setIsBulkUtilizedDialogOpen(true)}
                className="flex items-center gap-2"
                data-testid="button-bulk-update-utilized"
              >
                Update Utilized In ({selectedItems.size})
              </Button>
            </>
          )}

          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="flex items-center gap-2"
            data-testid="button-export"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>

          <Button
            variant="outline"
            onClick={() => setIsImportDialogOpen(true)}
            className="flex items-center gap-2"
            data-testid="button-import"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>

          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (open && !editingItem) {
              resetForm();
              fetch('/api/inventory/items/next-part-number')
                .then(r => r.json())
                .then(data => {
                  if (data.nextPartNumber) {
                    setFormData(prev => ({ ...prev, agPartNumber: data.nextPartNumber }));
                  }
                })
                .catch(() => {});
            }
          }}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-item">
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Create New Inventory Item</DialogTitle>
              </DialogHeader>
              <InventoryForm
                formData={formData}
                onSubmit={handleSubmit}
                onChange={handleChange}
                onSelectChange={handleSelectChange}
                onMultiSelectChange={handleMultiSelectChange}
                onCheckboxChange={handleCheckboxChange}
                onFileChange={handleSdsFileChange}
                editingItem={editingItem}
                isCreatePending={createMutation.isPending}
                isUpdatePending={updateMutation.isPending}
                onCancel={() => {
                  setIsCreateOpen(false);
                  resetForm();
                }}
                vendors={vendors}
                assets={assets}
                departments={departments}
                sdsFile={sdsFile}
                currentSdsFileName={currentSdsFileName}
                tdsFile={tdsFile}
                currentTdsFileName={currentTdsFileName}
                otherDocsFile={otherDocsFile}
                currentOtherDocsFileName={currentOtherDocsFileName}
                onTraceabilityClick={handleTraceabilityClick}
                isTraceabilityModalOpen={isTraceabilityModalOpen}
                onCloseTraceabilityModal={handleCloseTraceabilityModal}
                onSaveTraceabilityFields={handleSaveTraceabilityFields}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Parts List CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="csvFile">Select CSV File</Label>
              <Input
                id="csvFile"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="mt-2"
                data-testid="input-csv-file"
              />
            </div>
            {importFile && (
              <p className="text-sm text-gray-600">
                Selected file: {importFile.name}
              </p>
            )}

            <div className="flex items-start space-x-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
              <Checkbox
                id="replaceAllItems"
                checked={replaceAllItems}
                onCheckedChange={(checked) =>
                  setReplaceAllItems(checked as boolean)
                }
                data-testid="checkbox-replace-all"
              />
              <div className="flex-1">
                <Label
                  htmlFor="replaceAllItems"
                  className="cursor-pointer font-semibold text-blue-800 dark:text-blue-200"
                >
                  Update all items from CSV
                </Label>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  ℹ️ This will update existing items (matched by AG Part#) and
                  add new ones. Nothing will be deleted, so BOMs and other
                  references remain intact.
                </p>
              </div>
            </div>

            <div className="text-sm text-gray-500 space-y-1">
              <p className="font-semibold">Expected columns:</p>
              <p>
                AG Part#, SKU, Name, Source, Supplier Part #, Cost per, Order
                Date, Notes, Utilized, Secondary Source
              </p>
              <p className="text-xs italic mt-2">
                The "Utilized" column will be parsed for PL1, PL2, Facilities,
                Admin, Services
              </p>
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsImportDialogOpen(false);
                  setImportFile(null);
                  setReplaceAllItems(false);
                  const fileInput = document.getElementById(
                    'csvFile'
                  ) as HTMLInputElement;
                  if (fileInput) {
                    fileInput.value = '';
                  }
                }}
                data-testid="button-cancel-import"
              >
                Cancel
              </Button>
              <Button
                onClick={handleImportCSV}
                disabled={!importFile}
                data-testid="button-confirm-import"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={(v) => { if (v === 'purchased' || v === 'manufactured') { setActiveTab(v); } setSelectedItems(new Set()); }}>
        <TabsList className="mb-4">
          <TabsTrigger value="purchased" className="flex items-center gap-2" data-testid="tab-purchased">
            Purchased
            <Badge variant="secondary" className="ml-1">{purchasedItems.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="manufactured" className="flex items-center gap-2" data-testid="tab-manufactured">
            Manufactured
            <Badge variant="secondary" className="ml-1">{manufacturedItems.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="purchased">
      <div className="mb-4 space-y-3">
        <div className="flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Input
              placeholder="Search by AG Part #, SKU, Name, Notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          </div>

          <div className="w-48">
            <Select value={utilizedFilter} onValueChange={setUtilizedFilter}>
              <SelectTrigger data-testid="select-utilized-filter">
                <SelectValue placeholder="Filter by utilization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                <SelectItem value="pl1">PL1 Only</SelectItem>
                <SelectItem value="pl2">PL2 Only</SelectItem>
                <SelectItem value="pl3">PL3 Only</SelectItem>
                <SelectItem value="facilities">Facilities Only</SelectItem>
                <SelectItem value="admin">Admin Only</SelectItem>
                <SelectItem value="services">Services Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {!isLoading && (
          <div
            className="text-sm text-gray-600 dark:text-gray-400"
            data-testid="text-item-count"
          >
            Showing <span className="font-semibold">{items.length}</span>{' '}
            {items.length === 1 ? 'item' : 'items'}
            {tabItems.length !== items.length && (
              <span className="text-gray-500">
                {' '}
                (filtered from {tabItems.length} total)
              </span>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading inventory items...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No inventory items found.{' '}
          {searchTerm && 'Try a different search term or '}Import your parts
          list to get started.
        </div>
      ) : (
        <div style={{ overflow: 'hidden', width: '100%' }}>
          <div style={{ overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ minWidth: '1400px', borderCollapse: 'collapse' }} className="w-full border border-gray-200 dark:border-gray-700">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800">
                <th className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-center w-12">
                  <Checkbox
                    checked={
                      selectedItems.size === items.length && items.length > 0
                    }
                    onCheckedChange={toggleSelectAll}
                    data-testid="checkbox-select-all"
                  />
                </th>
                <th
                  className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => handleSort('agPartNumber')}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && handleSort('agPartNumber')
                  }
                  tabIndex={0}
                  role="button"
                  aria-sort={
                    sortColumn === 'agPartNumber'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  data-testid="header-agPartNumber"
                >
                  <div className="flex items-center gap-2">
                    AG Part#
                    {sortColumn === 'agPartNumber' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )
                    ) : (
                      <ArrowUpDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </th>
                <th
                  className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => handleSort('sku')}
                  onKeyDown={(e) => e.key === 'Enter' && handleSort('sku')}
                  tabIndex={0}
                  role="button"
                  aria-sort={
                    sortColumn === 'sku'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  data-testid="header-sku"
                >
                  <div className="flex items-center gap-2">
                    SKU
                    {sortColumn === 'sku' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )
                    ) : (
                      <ArrowUpDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </th>
                <th
                  className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => handleSort('name')}
                  onKeyDown={(e) => e.key === 'Enter' && handleSort('name')}
                  tabIndex={0}
                  role="button"
                  aria-sort={
                    sortColumn === 'name'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  data-testid="header-name"
                >
                  <div className="flex items-center gap-2">
                    Name
                    {sortColumn === 'name' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )
                    ) : (
                      <ArrowUpDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </th>
                <th
                  className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => handleSort('source')}
                  onKeyDown={(e) => e.key === 'Enter' && handleSort('source')}
                  tabIndex={0}
                  role="button"
                  aria-sort={
                    sortColumn === 'source'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  data-testid="header-source"
                >
                  <div className="flex items-center gap-2">
                    Source
                    {sortColumn === 'source' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )
                    ) : (
                      <ArrowUpDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </th>
                <th
                  className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => handleSort('costPer')}
                  onKeyDown={(e) => e.key === 'Enter' && handleSort('costPer')}
                  tabIndex={0}
                  role="button"
                  aria-sort={
                    sortColumn === 'costPer'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  data-testid="header-costPer"
                >
                  <div className="flex items-center gap-2">
                    Cost per
                    {sortColumn === 'costPer' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )
                    ) : (
                      <ArrowUpDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </th>
                <th
                  className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => handleSort('currentQty')}
                  onKeyDown={(e) => e.key === 'Enter' && handleSort('currentQty')}
                  tabIndex={0}
                  role="button"
                  aria-sort={
                    sortColumn === 'currentQty'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  data-testid="header-currentQty"
                >
                  <div className="flex items-center gap-2">
                    Current Qty
                    {sortColumn === 'currentQty' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )
                    ) : (
                      <ArrowUpDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </th>
                <th
                  className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => handleSort('supplierPartNumber')}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && handleSort('supplierPartNumber')
                  }
                  tabIndex={0}
                  role="button"
                  aria-sort={
                    sortColumn === 'supplierPartNumber'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  data-testid="header-supplierPartNumber"
                >
                  <div className="flex items-center gap-2">
                    Supplier Part #
                    {sortColumn === 'supplierPartNumber' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )
                    ) : (
                      <ArrowUpDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </th>
                <th
                  className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => handleSort('secondarySource')}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && handleSort('secondarySource')
                  }
                  tabIndex={0}
                  role="button"
                  aria-sort={
                    sortColumn === 'secondarySource'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  data-testid="header-secondarySource"
                >
                  <div className="flex items-center gap-2">
                    Secondary Source
                    {sortColumn === 'secondarySource' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )
                    ) : (
                      <ArrowUpDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </th>
                <th className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left">
                  Utilized In
                </th>
                <th className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left">
                  Asset
                </th>
                <th className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800"
                    data-testid={`row-item-${item.id}`}
                  >
                    <td className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-center">
                      <Checkbox
                        checked={selectedItems.has(item.id)}
                        onCheckedChange={() => toggleSelectItem(item.id)}
                        data-testid={`checkbox-item-${item.id}`}
                      />
                    </td>
                    <td className="border border-gray-200 dark:border-gray-700 px-4 py-2 font-medium">
                      {item.agPartNumber}
                    </td>
                    <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">
                      {item.sku || '-'}
                    </td>
                    <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">
                      {item.name}
                    </td>
                    <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">
                      {item.source || '-'}
                    </td>
                    <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">
                      {item.costPer ? `$${item.costPer.toFixed(2)}` : '-'}
                    </td>
                    <td className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-right font-medium">
                      {balancesByPart[item.agPartNumber] != null ? balancesByPart[item.agPartNumber] : 0}
                    </td>
                    <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">
                      {item.supplierPartNumber || '-'}
                    </td>
                    <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">
                      {item.secondarySource || '-'}
                    </td>
                    <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {item.utilizedInPL1 && (
                          <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 rounded">
                            PL1
                          </span>
                        )}
                        {item.utilizedInPL2 && (
                          <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 rounded">
                            PL2
                          </span>
                        )}
                        {item.utilizedInPL3 && (
                          <span className="px-2 py-1 text-xs bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-100 rounded">
                            PL3
                          </span>
                        )}
                        {item.utilizedInFacilities && (
                          <span className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-100 rounded">
                            Facilities
                          </span>
                        )}
                        {item.utilizedInAdmin && (
                          <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded">
                            Admin
                          </span>
                        )}
                        {item.utilizedInServices && (
                          <span className="px-2 py-1 text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100 rounded">
                            Services
                          </span>
                        )}
                        {!item.utilizedInPL1 &&
                          !item.utilizedInPL2 &&
                          !item.utilizedInPL3 &&
                          !item.utilizedInFacilities &&
                          !item.utilizedInAdmin &&
                          !item.utilizedInServices &&
                          '-'}
                      </div>
                    </td>
                    <td className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm">
                      {(item as any).assignedToAsset || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(item)}
                          title="Edit"
                          data-testid={`button-edit-${item.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(item.id)}
                          disabled={deleteMutation.isPending}
                          title="Delete"
                          data-testid={`button-delete-${item.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
        </TabsContent>

        <TabsContent value="manufactured">
          <div className="mb-4 space-y-3">
            <div className="flex gap-4">
              <div className="relative flex-1 max-w-md">
                <Input
                  placeholder="Search by AG Part #, SKU, Name, Notes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-manufactured"
                />
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              </div>
              <div className="w-48">
                <Select value={utilizedFilter} onValueChange={setUtilizedFilter}>
                  <SelectTrigger data-testid="select-utilized-filter-manufactured">
                    <SelectValue placeholder="Filter by utilization" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Items</SelectItem>
                    <SelectItem value="pl1">PL1 Only</SelectItem>
                    <SelectItem value="pl2">PL2 Only</SelectItem>
                    <SelectItem value="pl3">PL3 Only</SelectItem>
                    <SelectItem value="facilities">Facilities Only</SelectItem>
                    <SelectItem value="admin">Admin Only</SelectItem>
                    <SelectItem value="services">Services Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8">Loading inventory items...</div>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {MANUFACTURED_CATEGORY_ORDER.map((category) => {
                const catItems = (groupedManufactured[category] || []).filter((item) => {
                  if (searchTerm.trim()) {
                    const s = searchTerm.toLowerCase();
                    if (
                      !item.agPartNumber.toLowerCase().includes(s) &&
                      !item.name.toLowerCase().includes(s) &&
                      !(item.sku && item.sku.toLowerCase().includes(s)) &&
                      !(item.source && item.source.toLowerCase().includes(s)) &&
                      !(item.supplierPartNumber && item.supplierPartNumber.toLowerCase().includes(s)) &&
                      !(item.department && item.department.toLowerCase().includes(s)) &&
                      !(item.notes && item.notes.toLowerCase().includes(s))
                    ) return false;
                  }
                  if (utilizedFilter !== 'all') {
                    switch (utilizedFilter) {
                      case 'pl1': return item.utilizedInPL1;
                      case 'pl2': return item.utilizedInPL2;
                      case 'pl3': return item.utilizedInPL3;
                      case 'facilities': return item.utilizedInFacilities;
                      case 'admin': return item.utilizedInAdmin;
                      case 'services': return item.utilizedInServices;
                      default: return true;
                    }
                  }
                  return true;
                });
                const dashboard = getSupplySourceDashboard(category);
                return (
                  <AccordionItem key={category} value={category} className="border rounded-md">
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center gap-3 text-left">
                        <span className="font-semibold">{CATEGORY_DISPLAY_NAMES[category]}</span>
                        <Badge variant="outline">{catItems.length}</Badge>
                        {dashboard && (
                          <Badge variant="secondary" className="text-xs">
                            → {DASHBOARD_DISPLAY_NAMES[dashboard] ?? dashboard}
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="h-9 px-4 text-left font-medium">AG Part #</th>
                              <th className="h-9 px-4 text-left font-medium">Name</th>
                              <th className="h-9 px-4 text-left font-medium">Level</th>
                              <th className="h-9 px-4 text-left font-medium">Utilized In</th>
                              <th className="h-9 px-4 text-left font-medium">Current Qty</th>
                              <th className="h-9 px-4 text-left font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {catItems.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="py-6 text-center text-gray-500 text-xs">
                                  No {CATEGORY_DISPLAY_NAMES[category]} items
                                  {(searchTerm || utilizedFilter !== 'all') && ' matching filters'}
                                </td>
                              </tr>
                            ) : (
                              catItems.map((item) => (
                                <tr key={item.id} className="border-b hover:bg-muted/50 transition-colors">
                                  <td className="px-4 py-2 font-mono text-xs">{item.agPartNumber}</td>
                                  <td className="px-4 py-2 font-medium">{item.name}</td>
                                  <td className="px-4 py-2">
                                    {item.manufacturingLevel ? (
                                      <Badge variant="outline" className="text-xs capitalize">
                                        {item.manufacturingLevel.toLowerCase()}
                                      </Badge>
                                    ) : '—'}
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex flex-wrap gap-1">
                                      {item.utilizedInPL1 && <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 rounded">PL1</span>}
                                      {item.utilizedInPL2 && <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 rounded">PL2</span>}
                                      {item.utilizedInPL3 && <span className="px-2 py-0.5 text-xs bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-100 rounded">PL3</span>}
                                      {item.utilizedInFacilities && <span className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-100 rounded">Facilities</span>}
                                      {item.utilizedInAdmin && <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded">Admin</span>}
                                      {item.utilizedInServices && <span className="px-2 py-0.5 text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100 rounded">Services</span>}
                                      {!item.utilizedInPL1 && !item.utilizedInPL2 && !item.utilizedInPL3 && !item.utilizedInFacilities && !item.utilizedInAdmin && !item.utilizedInServices && '—'}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 font-medium">
                                    {balancesByPart[item.agPartNumber] != null ? balancesByPart[item.agPartNumber] : 0}
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex space-x-2">
                                      <Button variant="outline" size="sm" onClick={() => handleEdit(item)} title="Edit" data-testid={`button-edit-mfg-${item.id}`}>
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                      <Button variant="outline" size="sm" onClick={() => handleDelete(item.id)} disabled={deleteMutation.isPending} title="Delete" data-testid={`button-delete-mfg-${item.id}`}>
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
              {(() => {
                const filteredUncategorized = uncategorizedManufactured.filter((item) => {
                  if (searchTerm.trim()) {
                    const s = searchTerm.toLowerCase();
                    if (
                      !item.agPartNumber.toLowerCase().includes(s) &&
                      !item.name.toLowerCase().includes(s) &&
                      !(item.sku && item.sku.toLowerCase().includes(s)) &&
                      !(item.source && item.source.toLowerCase().includes(s)) &&
                      !(item.supplierPartNumber && item.supplierPartNumber.toLowerCase().includes(s)) &&
                      !(item.department && item.department.toLowerCase().includes(s)) &&
                      !(item.notes && item.notes.toLowerCase().includes(s))
                    ) return false;
                  }
                  if (utilizedFilter !== 'all') {
                    switch (utilizedFilter) {
                      case 'pl1': return item.utilizedInPL1;
                      case 'pl2': return item.utilizedInPL2;
                      case 'pl3': return item.utilizedInPL3;
                      case 'facilities': return item.utilizedInFacilities;
                      case 'admin': return item.utilizedInAdmin;
                      case 'services': return item.utilizedInServices;
                      default: return true;
                    }
                  }
                  return true;
                });
                if (filteredUncategorized.length === 0) return null;
                return (
                  <AccordionItem value="uncategorized" className="border rounded-md">
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center gap-3 text-left">
                        <span className="font-semibold text-amber-700">Uncategorized</span>
                        <Badge variant="outline">{filteredUncategorized.length}</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-0">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="h-9 px-4 text-left font-medium">AG Part #</th>
                            <th className="h-9 px-4 text-left font-medium">Name</th>
                            <th className="h-9 px-4 text-left font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUncategorized.map((item) => (
                            <tr key={item.id} className="border-b hover:bg-muted/50 transition-colors">
                              <td className="px-4 py-2 font-mono text-xs">{item.agPartNumber}</td>
                              <td className="px-4 py-2 font-medium">{item.name}</td>
                              <td className="px-4 py-2">
                                <div className="flex space-x-2">
                                  <Button variant="outline" size="sm" onClick={() => handleEdit(item)} title="Edit">
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => handleDelete(item.id)} disabled={deleteMutation.isPending} title="Delete">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </AccordionContent>
                  </AccordionItem>
                );
              })()}
            </Accordion>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) {
            setEditingItem(null);
            resetForm();
            setRoutingCreateMode(null);
            setSelectedTemplateId('');
            setSelectedExistingRoutingId('');
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Inventory Item</DialogTitle>
          </DialogHeader>
          <InventoryForm
            formData={formData}
            onSubmit={handleSubmit}
            onChange={handleChange}
            onSelectChange={handleSelectChange}
            onMultiSelectChange={handleMultiSelectChange}
            onCheckboxChange={handleCheckboxChange}
            onFileChange={handleSdsFileChange}
            editingItem={editingItem}
            isCreatePending={createMutation.isPending}
            isUpdatePending={updateMutation.isPending}
            onCancel={() => {
              setIsEditOpen(false);
              setEditingItem(null);
              resetForm();
              setRoutingCreateMode(null);
              setSelectedTemplateId('');
              setSelectedExistingRoutingId('');
            }}
            vendors={vendors}
            assets={assets}
            departments={departments}
            sdsFile={sdsFile}
            currentSdsFileName={currentSdsFileName}
            tdsFile={tdsFile}
            currentTdsFileName={currentTdsFileName}
            otherDocsFile={otherDocsFile}
            currentOtherDocsFileName={currentOtherDocsFileName}
            onTraceabilityClick={handleTraceabilityClick}
            isTraceabilityModalOpen={isTraceabilityModalOpen}
            onCloseTraceabilityModal={handleCloseTraceabilityModal}
            onSaveTraceabilityFields={handleSaveTraceabilityFields}
          />
          {editingItem?.agPartNumber && (
            <div className="mt-6 border-t pt-6">
              <InventoryItemCostHistory
                agPartNumber={editingItem.agPartNumber}
                vendorUnit={editingItem.vendorUnit || undefined}
                purchaseUnit={editingItem.purchaseUnit || undefined}
                purchaseQuantity={editingItem.purchaseQuantity || undefined}
                consumptionRate={editingItem.consumptionRate || undefined}
                usageUnit={editingItem.usageUnit || undefined}
              />
            </div>
          )}

          {/* Routing Section — only for manufactured items */}
          {isManufactured && (
            <div className="mt-6 border-t pt-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <GitBranch className="h-4 w-4" />
                    Part Routing
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isRoutingLoading ? (
                    <div className="text-sm text-muted-foreground animate-pulse">Loading routing…</div>
                  ) : itemRouting && itemRouting.id ? (
                    /* ── Routing linked ── */
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs uppercase tracking-wide">Name</span>
                          <p className="font-medium mt-0.5">{itemRouting.routingName}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs uppercase tracking-wide">Type</span>
                          <p className="font-medium mt-0.5">{itemRouting.routingType}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs uppercase tracking-wide">Revision</span>
                          <p className="font-medium mt-0.5">Rev {itemRouting.routingRevision}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs uppercase tracking-wide">Status</span>
                          <div className="mt-0.5">
                            <Badge variant={itemRouting.isActive ? 'default' : 'secondary'}>
                              {itemRouting.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => navigateTo('/p2-control-center')}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View / Edit in Routing Hub
                      </Button>
                    </div>
                  ) : (
                    /* ── No routing yet ── */
                    <div className="space-y-4">
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>No routing is linked to this part. Choose how to create one below.</span>
                      </div>

                      {/* Mode selector buttons */}
                      {routingCreateMode === null && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            className="gap-2"
                            onClick={() => createRoutingMutation.mutate()}
                            disabled={createRoutingMutation.isPending}
                          >
                            <GitBranch className="h-3.5 w-3.5" />
                            {createRoutingMutation.isPending ? 'Creating…' : 'Create Blank'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => { setRoutingCreateMode('template'); setSelectedTemplateId(''); }}
                          >
                            <GitBranch className="h-3.5 w-3.5" />
                            From Template
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => { setRoutingCreateMode('link'); setSelectedExistingRoutingId(''); }}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Link Existing
                          </Button>
                        </div>
                      )}

                      {/* From Template sub-panel */}
                      {routingCreateMode === 'template' && (
                        <div className="rounded-md border p-4 space-y-3 bg-muted/30">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">Select a Routing Template</Label>
                            <Button variant="ghost" size="sm" onClick={() => setRoutingCreateMode(null)} className="h-6 px-2 text-xs">
                              Cancel
                            </Button>
                          </div>
                          {isTemplatesLoading ? (
                            <p className="text-sm text-muted-foreground animate-pulse">Loading templates…</p>
                          ) : routingTemplatesList.length === 0 ? (
                            <div className="text-sm text-muted-foreground flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                              <span>No active routing templates found. Create templates in the Routing Hub first.</span>
                            </div>
                          ) : (
                            <>
                              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Choose a template…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {routingTemplatesList.map((t: any) => (
                                    <SelectItem key={t.id} value={t.id}>
                                      <span className="font-medium">{t.templateName}</span>
                                      <span className="ml-2 text-xs text-muted-foreground">{t.routingType}</span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {selectedTemplateId && (
                                <div className="text-xs text-muted-foreground px-1">
                                  {(() => {
                                    const t = routingTemplatesList.find((x: any) => x.id === selectedTemplateId);
                                    return t?.description ? <p>{t.description}</p> : null;
                                  })()}
                                </div>
                              )}
                              <Button
                                size="sm"
                                disabled={!selectedTemplateId || createFromTemplateMutation.isPending}
                                onClick={() => createFromTemplateMutation.mutate()}
                                className="gap-2"
                              >
                                <GitBranch className="h-3.5 w-3.5" />
                                {createFromTemplateMutation.isPending ? 'Creating…' : 'Create from Template'}
                              </Button>
                            </>
                          )}
                        </div>
                      )}

                      {/* Link Existing sub-panel */}
                      {routingCreateMode === 'link' && (
                        <div className="rounded-md border p-4 space-y-3 bg-muted/30">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">Link an Existing Routing</Label>
                            <Button variant="ghost" size="sm" onClick={() => setRoutingCreateMode(null)} className="h-6 px-2 text-xs">
                              Cancel
                            </Button>
                          </div>
                          {isAvailableRoutingsLoading ? (
                            <p className="text-sm text-muted-foreground animate-pulse">Loading routings…</p>
                          ) : availableRoutingsList.length === 0 ? (
                            <div className="text-sm text-muted-foreground flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                              <span>No other routings available to link. Create a routing in the Routing Hub first.</span>
                            </div>
                          ) : (
                            <>
                              <Select value={selectedExistingRoutingId} onValueChange={setSelectedExistingRoutingId}>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Choose a routing…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableRoutingsList.map((r: any) => (
                                    <SelectItem key={r.id} value={r.id}>
                                      <span className="font-medium">{r.routingName}</span>
                                      <span className="ml-2 text-xs text-muted-foreground">{r.partNumber} · Rev {r.routingRevision}</span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                disabled={!selectedExistingRoutingId || linkExistingRoutingMutation.isPending}
                                onClick={() => linkExistingRoutingMutation.mutate()}
                                className="gap-2"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                {linkExistingRoutingMutation.isPending ? 'Linking…' : 'Link Routing'}
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add to Group Dialog */}
      <Dialog
        open={isAddToGroupDialogOpen}
        onOpenChange={setIsAddToGroupDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Items to Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="group-select">Select Group</Label>
              <Select
                value={selectedGroupId}
                onValueChange={setSelectedGroupId}
              >
                <SelectTrigger id="group-select" data-testid="select-group">
                  <SelectValue placeholder="Choose a group" />
                </SelectTrigger>
                <SelectContent>
                  {allGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id.toString()}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {allGroups.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No groups available. Create a group first from the Manage
                  Groups page.
                </p>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {selectedItems.size} {selectedItems.size === 1 ? 'item' : 'items'}{' '}
              selected
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsAddToGroupDialogOpen(false);
                setSelectedGroupId('');
              }}
              data-testid="button-cancel-add-to-group"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddToGroup}
              disabled={addToGroupMutation.isPending || !selectedGroupId}
              data-testid="button-confirm-add-to-group"
            >
              Add to Group
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isBulkUtilizedDialogOpen}
        onOpenChange={setIsBulkUtilizedDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Update Utilized In</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md p-3 mb-4">
              <p className="text-sm text-amber-900 dark:text-amber-100">
                <strong>⚠️ Warning:</strong> This will REPLACE all utilization
                flags for the selected items. Checked options will be enabled,
                unchecked options will be DISABLED for all selected items.
              </p>
            </div>
            <div className="space-y-3">
              <Label>
                Select which production lines/departments these items should be
                utilized in:
              </Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="bulk-utilizedInPL1"
                    checked={bulkUtilizedFields.utilizedInPL1}
                    onCheckedChange={(checked) =>
                      setBulkUtilizedFields({
                        ...bulkUtilizedFields,
                        utilizedInPL1: checked as boolean,
                      })
                    }
                    data-testid="checkbox-bulk-utilizedInPL1"
                  />
                  <Label
                    htmlFor="bulk-utilizedInPL1"
                    className="cursor-pointer"
                  >
                    PL1
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="bulk-utilizedInPL2"
                    checked={bulkUtilizedFields.utilizedInPL2}
                    onCheckedChange={(checked) =>
                      setBulkUtilizedFields({
                        ...bulkUtilizedFields,
                        utilizedInPL2: checked as boolean,
                      })
                    }
                    data-testid="checkbox-bulk-utilizedInPL2"
                  />
                  <Label
                    htmlFor="bulk-utilizedInPL2"
                    className="cursor-pointer"
                  >
                    PL2
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="bulk-utilizedInPL3"
                    checked={bulkUtilizedFields.utilizedInPL3}
                    onCheckedChange={(checked) =>
                      setBulkUtilizedFields({
                        ...bulkUtilizedFields,
                        utilizedInPL3: checked as boolean,
                      })
                    }
                    data-testid="checkbox-bulk-utilizedInPL3"
                  />
                  <Label
                    htmlFor="bulk-utilizedInPL3"
                    className="cursor-pointer"
                  >
                    PL3
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="bulk-utilizedInFacilities"
                    checked={bulkUtilizedFields.utilizedInFacilities}
                    onCheckedChange={(checked) =>
                      setBulkUtilizedFields({
                        ...bulkUtilizedFields,
                        utilizedInFacilities: checked as boolean,
                      })
                    }
                    data-testid="checkbox-bulk-utilizedInFacilities"
                  />
                  <Label
                    htmlFor="bulk-utilizedInFacilities"
                    className="cursor-pointer"
                  >
                    Facilities
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="bulk-utilizedInAdmin"
                    checked={bulkUtilizedFields.utilizedInAdmin}
                    onCheckedChange={(checked) =>
                      setBulkUtilizedFields({
                        ...bulkUtilizedFields,
                        utilizedInAdmin: checked as boolean,
                      })
                    }
                    data-testid="checkbox-bulk-utilizedInAdmin"
                  />
                  <Label
                    htmlFor="bulk-utilizedInAdmin"
                    className="cursor-pointer"
                  >
                    Admin
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="bulk-utilizedInServices"
                    checked={bulkUtilizedFields.utilizedInServices}
                    onCheckedChange={(checked) =>
                      setBulkUtilizedFields({
                        ...bulkUtilizedFields,
                        utilizedInServices: checked as boolean,
                      })
                    }
                    data-testid="checkbox-bulk-utilizedInServices"
                  />
                  <Label
                    htmlFor="bulk-utilizedInServices"
                    className="cursor-pointer"
                  >
                    Services
                  </Label>
                </div>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {selectedItems.size} {selectedItems.size === 1 ? 'item' : 'items'}{' '}
              will be updated
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsBulkUtilizedDialogOpen(false);
                setBulkUtilizedFields({
                  utilizedInPL1: false,
                  utilizedInPL2: false,
                  utilizedInPL3: false,
                  utilizedInFacilities: false,
                  utilizedInAdmin: false,
                  utilizedInServices: false,
                });
              }}
              data-testid="button-cancel-bulk-utilized"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkUtilizedUpdate}
              disabled={bulkUpdateUtilizedMutation.isPending}
              data-testid="button-confirm-bulk-utilized"
            >
              Update Items
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
