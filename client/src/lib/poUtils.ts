import { apiRequest } from "@/lib/queryClient";

// PO Types
export interface PurchaseOrder {
  id: number;
  poNumber: string;
  customerId: string;
  customerName: string;
  poDate: string;
  expectedDelivery: string;
  status: 'OPEN' | 'CLOSED' | 'CANCELED';
  notes?: string;
  createdAt: string;
  updatedAt: string;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: number;
  poId: number;
  modelId: string;
  modelName: string;
  quantity: number;
  notes?: string;
  orderCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePurchaseOrderData {
  poNumber: string;
  customerId: string;
  customerName: string;
  poDate: string;
  expectedDelivery: string;
  status: 'OPEN' | 'CLOSED' | 'CANCELED';
  notes?: string;
}

export interface CreatePurchaseOrderItemData {
  modelId: string;
  modelName: string;
  quantity: number;
  notes?: string;
}

// Fetch all POs
export async function fetchPOs(): Promise<PurchaseOrder[]> {
  const response = await apiRequest('/api/pos');
  return response;
}

// Fetch single PO (optionally with items/order count)
export async function fetchPO(id: number, options?: { includeItems?: boolean; includeOrderCount?: boolean }): Promise<PurchaseOrder> {
  const params = new URLSearchParams();
  if (options?.includeItems) params.append('includeItems', 'true');
  if (options?.includeOrderCount) params.append('includeOrderCount', 'true');
  
  const response = await apiRequest(`/api/pos/${id}?${params.toString()}`);
  return response;
}

// Create PO
export async function createPO(data: CreatePurchaseOrderData): Promise<PurchaseOrder> {
  console.log('createPO called with data:', data);
  const response = await apiRequest('/api/pos', {
    method: 'POST',
    body: data
  });
  return response;
}

// Update PO
export async function updatePO(id: number, data: Partial<CreatePurchaseOrderData>): Promise<PurchaseOrder> {
  const response = await apiRequest(`/api/pos/${id}`, {
    method: 'PUT',
    body: data
  });
  return response;
}

// Delete PO
export async function deletePO(id: number): Promise<void> {
  await apiRequest(`/api/pos/${id}`, {
    method: 'DELETE'
  });
}

// Fetch items for a PO
export async function fetchPOItems(poId: number): Promise<PurchaseOrderItem[]> {
  const response = await apiRequest(`/api/pos/${poId}/items`);
  return response;
}

// Create PO item
export async function createPOItem(poId: number, data: CreatePurchaseOrderItemData): Promise<PurchaseOrderItem> {
  const response = await apiRequest(`/api/pos/${poId}/items`, {
    method: 'POST',
    body: data
  });
  return response;
}

// Update PO item
export async function updatePOItem(poId: number, itemId: number, data: Partial<CreatePurchaseOrderItemData>): Promise<PurchaseOrderItem> {
  const response = await apiRequest(`/api/pos/${poId}/items/${itemId}`, {
    method: 'PUT',
    body: data
  });
  return response;
}

// Delete PO item
export async function deletePOItem(poId: number, itemId: number): Promise<void> {
  await apiRequest(`/api/pos/${poId}/items/${itemId}`, {
    method: 'DELETE'
  });
}

// Generate orders from PO
export async function generateOrdersFromPO(poId: number): Promise<void> {
  await apiRequest(`/api/pos/${poId}/generate-orders`, {
    method: 'POST'
  });
}

// CSV Import functionality would go here
// For now, we'll create a placeholder
export async function importPOsFromCsv(file: File, onProgress?: (progress: { done: number; total: number }) => void): Promise<void> {
  // TODO: Implement CSV import functionality
  console.log('CSV import not yet implemented', file, onProgress);
}