// Order ID Generation Utility
// Based on year-month format: EH001, EH002, etc.
// Year Letters: 2025=E, 2026=F, ..., 2043=W, 2044=AA, 2045=AB...
// Month Letters: Jan=A, Feb=B, ..., Dec=L

export function generateP1OrderId(date: Date, lastId: string): string {
  // Calculate year letter (E=2025, F=2026, etc.)
  const year = date.getFullYear();
  const yearsSince2021 = year - 2021;
  
  let yearLetter: string;
  if (yearsSince2021 < 26) {
    // Single letter years (2021=A -> 2025=E, 2026=F, ..., 2046=Z)
    yearLetter = String.fromCharCode(65 + yearsSince2021);
  } else {
    // Double letter years (2047+)
    const firstLetter = Math.floor((yearsSince2021 - 26) / 26);
    const secondLetter = (yearsSince2021 - 26) % 26;
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
  // Try new format first: EH001, EH002, etc.
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

<<<<<<< HEAD
=======
// P2 Order ID Generation
// Format: customer3letters + year + sequential number starting at 0500
// Example: str250500, str250501, etc. for Strata-G customer in 2025
export function generateP2OrderId(customerName: string, existingP2OrderIds: string[] = []): string {
  // Get first 3 letters of customer name in lowercase
  const customerPrefix = customerName.toLowerCase().substring(0, 3);
  
  // Get current year (last 2 digits)
  const currentYear = new Date().getFullYear();
  const yearSuffix = currentYear.toString().slice(-2);
  
  // Base format: customer3letters + year
  const basePrefix = customerPrefix + yearSuffix;
  
  // Find the highest existing sequence number for this customer and year
  let maxSequence = 499; // Start at 499 so first ID will be 0500
  
  const prefixRegex = new RegExp(`^${basePrefix}(\\d{4})$`);
  for (const orderId of existingP2OrderIds) {
    const match = prefixRegex.exec(orderId);
    if (match) {
      const sequence = parseInt(match[1], 10);
      if (sequence > maxSequence) {
        maxSequence = sequence;
      }
    }
  }
  
  // Generate next sequence number
  const nextSequence = maxSequence + 1;
  const sequenceStr = nextSequence.toString().padStart(4, '0');
  
  return basePrefix + sequenceStr;
}

>>>>>>> origin/main
// Helper function to get current year-month prefix (e.g., "EH" for August 2025)
export function getCurrentYearMonthPrefix(date: Date = new Date()): string {
  const year = date.getFullYear();
  const yearsSince2021 = year - 2021;
  
  let yearLetter: string;
  if (yearsSince2021 < 26) {
    // Single letter years (2021=A -> 2025=E, 2026=F, ..., 2046=Z)
    yearLetter = String.fromCharCode(65 + yearsSince2021);
  } else {
    // Double letter years (2047+)
    const firstLetter = Math.floor((yearsSince2021 - 26) / 26);
    const secondLetter = (yearsSince2021 - 26) % 26;
    yearLetter = String.fromCharCode(65 + firstLetter) + String.fromCharCode(65 + secondLetter);
  }
  
  // Calculate month letter (Jan=A, Feb=B, ..., Dec=L)
  const month = date.getMonth(); // 0-based (0=Jan, 11=Dec)
  const monthLetter = String.fromCharCode(65 + month);
  
  return yearLetter + monthLetter;
}

// Parse an Order ID to extract its components
export function parseOrderId(orderId: string): { prefix: string; sequence: number } | null {
  // Try new format: EH001, EH002, etc.
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