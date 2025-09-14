// Order ID Generation Utility
// Based on year-month format: AG001, AG002, etc.
// Year Letters: 2025=A, 2026=B, ..., 2047=W, 2048=AA, 2049=AB...
// Month Letters: Jan=A, Feb=B, ..., Dec=L

export function generateP1OrderId(date: Date, lastId: string): string {
  // Calculate year letter
  const year = date.getFullYear();
  const yearsSince2025 = year - 2025;
  
  let yearLetter: string;
  if (yearsSince2025 < 26) {
    // Single letter years (2025-2047)
    yearLetter = String.fromCharCode(65 + yearsSince2025);
  } else {
    // Double letter years (2048+)
    const firstLetter = Math.floor((yearsSince2025 - 26) / 26);
    const secondLetter = (yearsSince2025 - 26) % 26;
    yearLetter = String.fromCharCode(65 + firstLetter) + String.fromCharCode(65 + secondLetter);
  }
  
  // Calculate month letter (Jan=A, Feb=B, ..., Dec=L)
  const month = date.getMonth(); // 0-based (0=Jan, 11=Dec)
  const monthLetter = String.fromCharCode(65 + month);
  
  const currentPrefix = yearLetter + monthLetter;
  
  // If no lastId provided, start with 001
  if (!lastId || lastId.trim() === '') {
    return currentPrefix + '001';
  }
  
  // Parse the last order ID - handle both current format and legacy formats
  // Try new format first: AG001, AG002, etc.
  let match = /^([A-Z]+)([A-Z])(\d{3,})$/.exec(lastId.trim());
  
  if (match) {
    // New format matched
    const [, lastYearLetter, lastMonthLetter, numStr] = match;
    const lastSeq = parseInt(numStr, 10);
    const lastPrefix = lastYearLetter + lastMonthLetter;
    
    if (lastPrefix === currentPrefix) {
      // Same month and year - increment sequence
      const nextSeq = lastSeq + 1;
      return currentPrefix + String(nextSeq).padStart(3, '0');
    } else {
      // Different month or year - reset to 001
      return currentPrefix + '001';
    }
  }
  
  // Try legacy formats: UNIQUE002, TEST001, ED001, EG001, AP002, etc.
  match = /^([A-Z]+)(\d{3,})$/.exec(lastId.trim());
  if (match) {
    // Legacy format - just use current prefix and start with 001
    // Since we're switching to new format, start fresh
    return currentPrefix + '001';
  }
  
  // If no format matches, start with current prefix + 001
  return currentPrefix + '001';
}

// Helper function to get current year-month prefix (e.g., "AG" for July 2025)
export function getCurrentYearMonthPrefix(date: Date = new Date()): string {
  const year = date.getFullYear();
  const yearsSince2025 = year - 2025;
  
  let yearLetter: string;
  if (yearsSince2025 < 26) {
    // Single letter years (2025-2047)
    yearLetter = String.fromCharCode(65 + yearsSince2025);
  } else {
    // Double letter years (2048+)
    const firstLetter = Math.floor((yearsSince2025 - 26) / 26);
    const secondLetter = (yearsSince2025 - 26) % 26;
    yearLetter = String.fromCharCode(65 + firstLetter) + String.fromCharCode(65 + secondLetter);
  }
  
  // Calculate month letter (Jan=A, Feb=B, ..., Dec=L)
  const month = date.getMonth(); // 0-based (0=Jan, 11=Dec)
  const monthLetter = String.fromCharCode(65 + month);
  
  return yearLetter + monthLetter;
}

// Parse an Order ID to extract its components
export function parseOrderId(orderId: string): { prefix: string; sequence: number } | null {
  // Try new format: AG001, AG002, etc.
  const match = /^([A-Z]+)(\d{3,})$/.exec(orderId.trim());
  
  if (match) {
    const [, prefix, numStr] = match;
    const sequence = parseInt(numStr, 10);
    return { prefix, sequence };
  }
  
  return null;
}

// Generate Order ID from prefix and sequence number
export function formatOrderId(prefix: string, sequence: number): string {
  return prefix + String(sequence).padStart(3, '0');
}