import axios from 'axios';

/**
 * Fetch Accounts Payable transactions within a date range
 * @param {Object} params - Date range parameters
 * @param {string} params.dateFrom - Start date in YYYY-MM-DD format
 * @param {string} params.dateTo - End date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of AP transactions with shape: { id, poNumber, vendorName, amount, date, status }
 */
export async function fetchAPTransactions({ dateFrom, dateTo }) {
  const response = await axios.get(`/api/finance/ap`, {
    params: { dateFrom, dateTo }
  });
  return response.data;
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
    params: { dateFrom, dateTo }
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
    params: { dateFrom, dateTo }
  });
  return response.data;
}