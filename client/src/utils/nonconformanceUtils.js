import { apiRequest } from '../lib/queryClient';

/**
 * createRecord(data)
 * POST /api/nonconformance
 */
export function createRecord(data) {
  return apiRequest('/api/nonconformance', {
    method: 'POST',
    body: data,
  });
}

/**
 * updateRecord(id, data)
 * PUT /api/nonconformance/{id}
 */
export function updateRecord(id, data) {
  return apiRequest(`/api/nonconformance/${id}`, {
    method: 'PUT',
    body: data,
  });
}

/**
 * fetchRecords(filters)
 * GET /api/nonconformance?…
 */
export function fetchRecords(filters) {
  const params = new URLSearchParams(filters).toString();
  return apiRequest(`/api/nonconformance?${params}`);
}

/**
 * fetchAnalytics(filters)
 * GET /api/nonconformance/analytics?…
 */
export function fetchAnalytics(filters) {
  const params = new URLSearchParams(filters).toString();
  return apiRequest(`/api/nonconformance/analytics?${params}`);
}

/**
 * fetchOne(id)
 * GET /api/nonconformance/{id}
 */
export function fetchOne(id) {
  return apiRequest(`/api/nonconformance/${id}`);
}

/**
 * deleteRecord(id)
 * DELETE /api/nonconformance/{id}
 */
export function deleteRecord(id) {
  return apiRequest(`/api/nonconformance/${id}`, {
    method: 'DELETE',
  });
}