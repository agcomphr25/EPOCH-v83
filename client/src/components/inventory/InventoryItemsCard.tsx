import React, { useState, useCallback, useEffect } from 'react';
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
  Calculator,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'wouter';
import type { InventoryItem, ItemGroup } from '@shared/schema';

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
  SelectItem,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { calculateCOGS } from '@/lib/unitConversion';
import { parseLeadTimeToDays } from '@/utils/leadTimeUtils';

interface InventoryFormData {
  agPartNumber: string;
  sku: string;
  name: string;
  type: string;
  manufacturingDepartment: string;
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
  traceabilityRequired: boolean;
  traceabilityFields: string[];
  utilizedInFacilities: boolean;
  utilizedInAdmin: boolean;
  utilizedInServices: boolean;
  isPacket: boolean;
  isPacketPart: boolean;
  isFabric: boolean;
  hasSds: boolean;
  hasTds: boolean;
  hasOtherDocs: boolean;
  assignedToAsset: string;
  defaultOrderMethod: string;
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
    {/* Basic Information Section */}
    <div className="space-y-4">
      <h4 className="text-md font-semibold border-b pb-2">Basic Information</h4>
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
          <Label htmlFor="type">Type</Label>
          <Select
            value={formData.type}
            onValueChange={(value) => onSelectChange('type', value)}
          >
            <SelectTrigger data-testid="select-type">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Purchased">Purchased</SelectItem>
              <SelectItem value="Manufactured">Manufactured</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {formData.type === 'Manufactured' && (
          <div>
            <Label htmlFor="manufacturingDepartment">Manufacturing Department</Label>
            <Select
              value={formData.manufacturingDepartment}
              onValueChange={(value) => onSelectChange('manufacturingDepartment', value)}
            >
              <SelectTrigger data-testid="select-manufacturingDepartment">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CNC">CNC</SelectItem>
                <SelectItem value="Cutting Table">Cutting Table</SelectItem>
                <SelectItem value="Cores">Cores</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
    </div>

    {/* Supplier Information Section */}
    <div className="space-y-4">
      <h4 className="text-md font-semibold border-b pb-2">
        Supplier Information
      </h4>
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
                vendors.map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id.toString()}>
                    {vendor.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="source">Source</Label>
          <Input
            id="source"
            name="source"
            value={formData.source}
            onChange={onChange}
            placeholder="Enter source (text field)"
            data-testid="input-source"
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
          <Label htmlFor="secondarySupplierPartNumber">
            Secondary Supplier Part #
          </Label>
          <Input
            id="secondarySupplierPartNumber"
            name="secondarySupplierPartNumber"
            value={formData.secondarySupplierPartNumber}
            onChange={onChange}
            placeholder="Enter secondary supplier part #"
            data-testid="input-secondarySupplierPartNumber"
          />
        </div>
      </div>
    </div>

    {/* Cost & Quantity Information Section */}
    <div className="space-y-4">
      <h4 className="text-md font-semibold border-b pb-2">
        Cost & Quantity (MRP/COGS)
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <Label htmlFor="purchaseUnit">Purchase Unit</Label>
          <Select
            value={formData.purchaseUnit}
            onValueChange={(value) => onSelectChange('purchaseUnit', value)}
          >
            <SelectTrigger id="purchaseUnit" data-testid="select-purchaseUnit">
              <SelectValue placeholder="Select unit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hr">hr (hour)</SelectItem>
              <SelectItem value="min">min (minute)</SelectItem>
              <SelectItem value="oz">oz (ounce)</SelectItem>
              <SelectItem value="lb">lb (pound)</SelectItem>
              <SelectItem value="g">g (gram)</SelectItem>
              <SelectItem value="kg">kg (kilogram)</SelectItem>
              <SelectItem value="ml">ml (milliliter)</SelectItem>
              <SelectItem value="L">L (liter)</SelectItem>
              <SelectItem value="gal">gal (gallon)</SelectItem>
              <SelectItem value="qt">qt (quart)</SelectItem>
              <SelectItem value="pt">pt (pint)</SelectItem>
              <SelectItem value="fl oz">fl oz (fluid ounce)</SelectItem>
              <SelectItem value="ft">ft (foot)</SelectItem>
              <SelectItem value="in">in (inch)</SelectItem>
              <SelectItem value="m">m (meter)</SelectItem>
              <SelectItem value="cm">cm (centimeter)</SelectItem>
              <SelectItem value="mm">mm (millimeter)</SelectItem>
              <SelectItem value="ea">ea (each)</SelectItem>
              <SelectItem value="pc">pc (piece)</SelectItem>
              <SelectItem value="sq ft">sq ft (square foot)</SelectItem>
              <SelectItem value="sq in">sq in (square inch)</SelectItem>
              <SelectItem value="sq m">sq m (square meter)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 mt-1">
            Unit of measurement (e.g., "g", "oz", "ea")
          </p>
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
          <Label htmlFor="consumptionRate">Consumption Rate</Label>
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
          <p className="text-xs text-gray-500 mt-1">Amount per item</p>
        </div>
        <div>
          <Label htmlFor="usageUnit">Usage Unit</Label>
          <Select
            value={formData.usageUnit}
            onValueChange={(value) => onSelectChange('usageUnit', value)}
          >
            <SelectTrigger id="usageUnit" data-testid="select-usageUnit">
              <SelectValue placeholder="Select unit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hr">hr (hour)</SelectItem>
              <SelectItem value="min">min (minute)</SelectItem>
              <SelectItem value="oz">oz (ounce)</SelectItem>
              <SelectItem value="lb">lb (pound)</SelectItem>
              <SelectItem value="g">g (gram)</SelectItem>
              <SelectItem value="kg">kg (kilogram)</SelectItem>
              <SelectItem value="ml">ml (milliliter)</SelectItem>
              <SelectItem value="L">L (liter)</SelectItem>
              <SelectItem value="gal">gal (gallon)</SelectItem>
              <SelectItem value="qt">qt (quart)</SelectItem>
              <SelectItem value="pt">pt (pint)</SelectItem>
              <SelectItem value="fl oz">fl oz (fluid ounce)</SelectItem>
              <SelectItem value="ft">ft (foot)</SelectItem>
              <SelectItem value="in">in (inch)</SelectItem>
              <SelectItem value="m">m (meter)</SelectItem>
              <SelectItem value="cm">cm (centimeter)</SelectItem>
              <SelectItem value="mm">mm (millimeter)</SelectItem>
              <SelectItem value="ea">ea (each)</SelectItem>
              <SelectItem value="pc">pc (piece)</SelectItem>
              <SelectItem value="sq ft">sq ft (square foot)</SelectItem>
              <SelectItem value="sq in">sq in (square inch)</SelectItem>
              <SelectItem value="sq m">sq m (square meter)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 mt-1">
            Unit of measurement (e.g., "g", "oz", "ea")
          </p>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <Label htmlFor="cogsPerUnit">COGS per Unit ($)</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Calculator className="w-4 h-4 text-blue-500" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Auto-calculated from conversion data</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            id="cogsPerUnit"
            name="cogsPerUnit"
            type="number"
            step="0.01"
            value={formData.cogsPerUnit}
            onChange={onChange}
            placeholder="0.68"
            data-testid="input-cogsPerUnit"
          />
          <p className="text-xs text-gray-500 mt-1">
            Auto-calculated or manually editable
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
      </div>
    </div>

    {/* Production Line Utilization Section */}
    <div className="space-y-4">
      <h4 className="text-md font-semibold border-b pb-2">
        Production Line Utilization
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="utilizedInPL1"
            checked={formData.utilizedInPL1}
            onCheckedChange={(checked) =>
              onCheckboxChange('utilizedInPL1', checked as boolean)
            }
            data-testid="checkbox-utilizedInPL1"
          />
          <Label htmlFor="utilizedInPL1" className="cursor-pointer">
            PL1
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="utilizedInPL2"
            checked={formData.utilizedInPL2}
            onCheckedChange={(checked) =>
              onCheckboxChange('utilizedInPL2', checked as boolean)
            }
            data-testid="checkbox-utilizedInPL2"
          />
          <Label htmlFor="utilizedInPL2" className="cursor-pointer">
            PL2
          </Label>
        </div>
        {formData.utilizedInPL2 && (
          <div className="flex items-center space-x-2 ml-6">
            <div className="flex items-center space-x-2">
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
          </div>
        )}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="utilizedInFacilities"
            checked={formData.utilizedInFacilities}
            onCheckedChange={(checked) =>
              onCheckboxChange('utilizedInFacilities', checked as boolean)
            }
            data-testid="checkbox-utilizedInFacilities"
          />
          <Label htmlFor="utilizedInFacilities" className="cursor-pointer">
            Facilities
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="utilizedInAdmin"
            checked={formData.utilizedInAdmin}
            onCheckedChange={(checked) =>
              onCheckboxChange('utilizedInAdmin', checked as boolean)
            }
            data-testid="checkbox-utilizedInAdmin"
          />
          <Label htmlFor="utilizedInAdmin" className="cursor-pointer">
            Admin
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="utilizedInServices"
            checked={formData.utilizedInServices}
            onCheckedChange={(checked) =>
              onCheckboxChange('utilizedInServices', checked as boolean)
            }
            data-testid="checkbox-utilizedInServices"
          />
          <Label htmlFor="utilizedInServices" className="cursor-pointer">
            Services
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="isPacket"
            checked={formData.isPacket}
            onCheckedChange={(checked) =>
              onCheckboxChange('isPacket', checked as boolean)
            }
            data-testid="checkbox-isPacket"
          />
          <Label htmlFor="isPacket" className="cursor-pointer">
            Packet
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="isPacketPart"
            checked={formData.isPacketPart}
            onCheckedChange={(checked) =>
              onCheckboxChange('isPacketPart', checked as boolean)
            }
            data-testid="checkbox-isPacketPart"
          />
          <Label htmlFor="isPacketPart" className="cursor-pointer">
            Packet Part
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="isFabric"
            checked={formData.isFabric}
            onCheckedChange={(checked) =>
              onCheckboxChange('isFabric', checked as boolean)
            }
            data-testid="checkbox-isFabric"
          />
          <Label htmlFor="isFabric" className="cursor-pointer">
            Fabric (Cutting Table)
          </Label>
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
    utilizedInFacilities: false,
    utilizedInAdmin: false,
    utilizedInServices: false,
  });

  const [formData, setFormData] = useState<InventoryFormData>({
    agPartNumber: '',
    sku: '',
    name: '',
    type: 'Purchased',
    manufacturingDepartment: '',
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
    traceabilityRequired: false,
    traceabilityFields: [],
    utilizedInFacilities: false,
    utilizedInAdmin: false,
    utilizedInServices: false,
    isPacket: false,
    isPacketPart: false,
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

    // Only calculate if we have all required fields
    if (
      costPer &&
      purchaseQuantity &&
      purchaseUnit &&
      consumptionRate &&
      usageUnit
    ) {
      const vendorPrice = parseFloat(costPer);
      const purQty = parseFloat(purchaseQuantity);
      const consRate = parseFloat(consumptionRate);

      const calculatedCOGS = calculateCOGS(
        vendorPrice,
        purQty,
        purchaseUnit,
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

  // Sort handler function
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const items = Array.isArray(allItems)
    ? allItems
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
      manufacturingDepartment: '',
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
      traceabilityRequired: false,
      traceabilityFields: [],
      utilizedInFacilities: false,
      utilizedInAdmin: false,
      utilizedInServices: false,
      isPacket: false,
      isPacketPart: false,
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

      if (!formData.agPartNumber || !formData.name) {
        toast.error('Please fill in AG Part# and Name (required fields)');
        return;
      }

      const submitData = {
        agPartNumber: formData.agPartNumber,
        sku: formData.sku || null,
        name: formData.name,
        type: formData.type || 'Purchased',
        manufacturingDepartment: formData.manufacturingDepartment || null,
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
        purchaseUnit: formData.purchaseUnit || null,
        purchaseQuantity: formData.purchaseQuantity
          ? parseFloat(formData.purchaseQuantity)
          : null,
        consumptionRate: formData.consumptionRate
          ? parseFloat(formData.consumptionRate)
          : null,
        usageUnit: formData.usageUnit || null,
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
        traceabilityRequired: formData.traceabilityRequired,
        traceabilityFields: formData.traceabilityFields,
        utilizedInFacilities: formData.utilizedInFacilities,
        utilizedInAdmin: formData.utilizedInAdmin,
        utilizedInServices: formData.utilizedInServices,
        isPacket: formData.isPacket,
        isPacketPart: formData.isPacketPart,
        isFabric: formData.isFabric,
        hasSds: formData.hasSds,
        hasTds: formData.hasTds,
        hasOtherDocs: formData.hasOtherDocs,
        assignedToAsset: formData.assignedToAsset || null,
        defaultOrderMethod: formData.defaultOrderMethod || null,
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
    setFormData({
      agPartNumber: item.agPartNumber,
      sku: item.sku || '',
      name: item.name,
      type: item.type || 'Purchased',
      manufacturingDepartment: (item as any).manufacturingDepartment || '',
      source: item.source || '',
      vendorId: item.vendorId ? item.vendorId.toString() : 'none',
      supplierPartNumber: item.supplierPartNumber || '',
      secondarySupplierPartNumber: item.secondarySupplierPartNumber || '',
      costPer: item.costPer != null ? item.costPer.toString() : '',
      vendorUnit: item.vendorUnit || '',
      purchaseUnitLabel: item.purchaseUnitLabel || '',
      purchaseUnit: item.purchaseUnit || '',
      purchaseQuantity: item.purchaseQuantity
        ? item.purchaseQuantity.toString()
        : '',
      consumptionRate: item.consumptionRate
        ? item.consumptionRate.toString()
        : '',
      usageUnit: item.usageUnit || '',
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
      traceabilityRequired: item.traceabilityRequired || false,
      traceabilityFields: (item as any).traceabilityFields || [],
      utilizedInFacilities: item.utilizedInFacilities || false,
      utilizedInAdmin: item.utilizedInAdmin || false,
      utilizedInServices: item.utilizedInServices || false,
      isPacket: (item as any).isPacket || false,
      isPacketPart: item.isPacketPart || false,
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
            {allItems.length !== items.length && (
              <span className="text-gray-500">
                {' '}
                (filtered from {allItems.length} total)
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
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
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
      )}

      <Dialog
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) {
            setEditingItem(null);
            resetForm();
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
                currentCost={editingItem.latestCost || undefined}
                vendorUnit={editingItem.vendorUnit || undefined}
                purchaseUnit={editingItem.purchaseUnit || undefined}
                purchaseQuantity={editingItem.purchaseQuantity || undefined}
                consumptionRate={editingItem.consumptionRate || undefined}
                usageUnit={editingItem.usageUnit || undefined}
              />
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
