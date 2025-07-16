/**
 * Generate a P1 order ID with year-month format: XY### 
 * First letter = year (2025=A, 2026=B, ..., 2047=W, 2048=AA, 2049=AB...)
 * Second letter = month (Jan=A, Feb=B, ..., Dec=L)
 * Numbers = sequential within month, reset monthly, continue after 999
 *
 * @param {Date} orderDate   – the order date
 * @param {string} lastId    – previous ID (e.g. "AG045")
 * @returns {string}         – next ID
 */
export function generateP1OrderId(orderDate: Date, lastId: string): string {
  const year = orderDate.getFullYear();
  const month = orderDate.getMonth(); // 0-11
  
  // Year letter: 2025=A, 2026=B, etc.
  const yearLetter = getYearLetter(year);
  
  // Month letter: Jan=A, Feb=B, etc.
  const monthLetter = String.fromCharCode(65 + month);
  
  const currentPrefix = yearLetter + monthLetter;
  
  console.log('P1 ID Generation:', {
    date: orderDate.toISOString().split('T')[0],
    year,
    month: month + 1,
    yearLetter,
    monthLetter,
    currentPrefix,
    lastId
  });
  
  // Handle empty lastId
  if (!lastId || lastId.trim() === '') {
    console.log('Empty lastId, starting with 001');
    return currentPrefix + '001';
  }
  
  // Extract from new format only: 2 letters + digits
  const newFormatMatch = /^([A-Z]{1,2})([A-Z])(\d+)$/i.exec(lastId.trim());
  if (!newFormatMatch) {
    console.log('LastId not in new format, starting with 001');
    return currentPrefix + '001';
  }
  
  const [, lastYearLetter, lastMonthLetter, lastSeqStr] = newFormatMatch;
  const lastPrefix = lastYearLetter + lastMonthLetter;
  const lastSeq = parseInt(lastSeqStr, 10);
  
  console.log('Parsed lastId:', {
    lastPrefix,
    lastSeq,
    currentPrefix,
    sameMonth: lastPrefix === currentPrefix
  });
  
  let nextSeq;
  if (lastPrefix === currentPrefix) {
    // Same month: increment sequence
    nextSeq = lastSeq + 1;
    console.log('Same month, incrementing sequence:', lastSeq, '→', nextSeq);
  } else {
    // Different month: reset to 001
    nextSeq = 1;
    console.log('Different month, resetting to 001');
  }
  
  // Format sequence (pad with zeros for numbers < 1000, no padding for 1000+)
  const seqStr = nextSeq < 1000 ? String(nextSeq).padStart(3, '0') : String(nextSeq);
  const result = currentPrefix + seqStr;
  
  console.log('Final result:', result);
  return result;
}

/**
 * Convert year to letter(s): 2025=E, 2026=F, ..., 2047=Z, 2048=AA, 2049=AB...
 */
function getYearLetter(year: number): string {
  const yearsSince2025 = year - 2025;
  
  console.log('Year calculation:', { year, yearsSince2025 });
  
  if (yearsSince2025 < 0) {
    throw new Error('Year must be 2025 or later');
  }
  
  if (yearsSince2025 <= 21) {
    // 2025-2046: Single letters E-Z (2025=E, 2026=F, ..., 2046=Z)
    const letter = String.fromCharCode(69 + yearsSince2025); // 69 = 'E'
    console.log('Single letter year:', letter);
    return letter;
  } else {
    // 2047+: Double letters AA, AB, AC...
    const doubleLetterIndex = yearsSince2025 - 22; // 2047 = 0, 2048 = 1...
    const firstLetter = 'A';
    const secondLetter = String.fromCharCode(65 + doubleLetterIndex);
    const result = firstLetter + secondLetter;
    console.log('Double letter year:', result, 'doubleLetterIndex:', doubleLetterIndex);
    return result;
  }
}



/**
 * Generate a P2 serial in the form XXXYY00001, 
 * where XXX = first 3 letters of customerCode,
 * YY  = last two digits of year,
 * 00001 = zero-padded sequence.
 *
 * @param {string} customerCode 
 * @param {number} year         
 * @param {number} lastSeq      – last numeric sequence (e.g. 1) or null
 * @returns {string}
 */
export function generateP2Serial(customerCode: string, year: number, lastSeq: number | null): string {
  // take first 3 letters of code, uppercase
  const code = (customerCode || '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  // two-digit year
  const yy = String(year % 100).padStart(2, '0');
  // next sequence
  const next = (lastSeq ?? 0) + 1;
  const seq = String(next).padStart(5, '0');
  return `${code}${yy}${seq}`;
}
