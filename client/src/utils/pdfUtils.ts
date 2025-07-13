import axios from 'axios';

/**
 * Fetch a PDF blob from a given endpoint.
 * @param endpoint - API endpoint for PDF generation
 * @param orderId - Order ID for PDF generation
 * @returns PDF blob
 */
export async function fetchPdf(endpoint: string, orderId: string): Promise<Blob> {
  const response = await axios.get(endpoint, {
    params: { orderId },
    responseType: 'blob', // ensure we get binary data
  });
  return response.data;
}

/**
 * Trigger browser download of a Blob as filename.
 * @param blob - PDF blob to download
 * @param filename - Desired filename
 */
export function downloadPdf(blob: Blob, filename: string): void {
  // Create a temporary object URL for the blob
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  // Clean up
  link.remove();
  window.URL.revokeObjectURL(url);
}