import axios from 'axios';

/**
 * Fetch Accounts Payable transactions within a date range
 * @param {Object} params - Date range parameters
 * @param {string} params.dateFrom - Start date in YYYY-MM-DD format
 * @param {string} params.dateTo - End date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of AP transactions with shape: { id, poNumber, vendorName, amount, date, status }
 */
export async function fetchAPTransactions({ dateFrom, dateTo }) {
  const response = await axios.get(`/api/ap-bills`, {
    params: { dateFrom, dateTo },
  });
  return response.data;
}

export async function fetchP2APContext(poNumber) {
  const response = await axios.get('/api/ap-bills/p2-context', {
    params: { poNumber },
  });
  return response.data;
}

export async function fetchVendorOptions() {
  const response = await axios.get('/api/vendors', {
    params: { pageSize: 10000, sort: 'name:asc' },
  });
  return response.data?.data || [];
}

export async function fetchAPBill(id) {
  const response = await axios.get(`/api/ap-bills/${id}`);
  return response.data;
}

export async function createAPBill(payload) {
  const response = await axios.post('/api/ap-bills', payload);
  return response.data;
}

export async function updateAPBill(id, payload) {
  const response = await axios.put(`/api/ap-bills/${id}`, payload);
  return response.data;
}

export async function uploadAPBillAttachments(billId, files) {
  if (!files || files.length === 0) return [];
  const form = new FormData();
  Array.from(files).forEach((file) => form.append('files', file));
  const response = await axios.post(`/api/ap-bills/${billId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function approveAndPostAPBill(billId) {
  const response = await axios.post(`/api/ap-bills/${billId}/approve-post`);
  return response.data;
}

export async function deleteAPBill(billId) {
  await axios.delete(`/api/ap-bills/${billId}`);
}

/**
 * Fetch Accounts Receivable transactions within a date range
 * @param {Object} params - Date range parameters
 * @param {string} params.dateFrom - Start date in YYYY-MM-DD format
 * @param {string} params.dateTo - End date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of AR transactions with shape: { id, orderId, customerName, amount, date, terms, status }
 */
export async function fetchARTransactions({ dateFrom, dateTo }) {
  const response = await axios.get(`/api/finance/ar`, {
    params: { dateFrom, dateTo },
  });
  return response.data;
}

/**
 * Fetch Cost of Goods Sold (COGS) data within a date range
 * @param {Object} params - Date range parameters
 * @param {string} params.dateFrom - Start date in YYYY-MM-DD format
 * @param {string} params.dateTo - End date in YYYY-MM-DD format
 * @returns {Promise<Object>} COGS data with shape: { standardCost: number, actualCost: number, breakdown: Array<{ category, standard, actual }> }
 */
export async function fetchCOGS({ dateFrom, dateTo }) {
  const response = await axios.get(`/api/finance/cogs`, {
    params: { dateFrom, dateTo },
  });
  return response.data;
}
