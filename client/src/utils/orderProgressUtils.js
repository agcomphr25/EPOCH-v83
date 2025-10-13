import axios from 'axios';

/**
 * Complete current department and move order to next department
 * @param {string} orderId - Order ID to progress
 * @param {string} nextDept - Optional: specify next department (for CNC -> Finish/Gunsmith choice)
 * @returns {Promise} API response
 */
export async function completeDepartment(orderId, nextDept) {
  try {
    const payload = nextDept ? { nextDepartment: nextDept } : {};
    return await axios.post(`/api/orders/${orderId}/progress`, payload);
  } catch (error) {
    console.error('Failed to complete department:', error);
    throw error;
  }
}

/**
 * Scrap an order with reason, disposition and authorization
 * @param {string} orderId - Order ID to scrap
 * @param {Object} payload - Scrap details {reason, disposition, authorization, scrapDate}
 * @returns {Promise} API response
 */
export async function scrapOrder(orderId, payload) {
  try {
    return await axios.post(`/api/orders/${orderId}/scrap`, payload);
  } catch (error) {
    console.error('Failed to scrap order:', error);
    throw error;
  }
}

/**
 * Create replacement order after scrapping
 * @param {string} orderId - Original order ID that was scrapped
 * @returns {Promise} API response
 */
export async function createReplacementOrder(orderId) {
  try {
    return await axios.post(`/api/orders/${orderId}/reload-replacement`);
  } catch (error) {
    console.error('Failed to create replacement order:', error);
    throw error;
  }
}

/**
 * Fetch all orders with department and schedule information
 * @returns {Promise} Orders data with department progression
 */
export async function fetchAllOrders() {
  try {
    // Include department info and schedule flags in query
    return await axios.get('/api/orders?view=all&includeDept&includeScheduleFlag');
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    throw error;
  }
}

/**
 * Fetch pipeline counts for all departments
 * @returns {Promise} Department counts object {Layup: 23, Plugging: 12, ...}
 */
export async function fetchPipelineCounts() {
  try {
    return await axios.get('/api/orders/pipeline-counts');
  } catch (error) {
    console.error('Failed to fetch pipeline counts:', error);
    throw error;
  }
}