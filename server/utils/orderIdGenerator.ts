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
  
  // Parse the last order ID
  const match = /^([A-Z]+)([A-Z])(\d{3,})$/.exec(lastId.trim());
  if (!match) {
    // Invalid format, start with current prefix + 001
    return currentPrefix + '001';
  }
  
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

// Utility function to get the last order ID from the database
export async function getLastOrderId(): Promise<string> {
  // This would query the orders table to get the most recent order ID
  // For now, we'll return a placeholder - this should be implemented with actual database query
  // TODO: Implement actual database query to get the last order ID
  return 'AG001'; // Placeholder
}