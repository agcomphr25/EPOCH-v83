// Reference start date for bi-weekly cycles (you can adjust as needed)
const BASE_DATE = new Date(2000, 0, 1); // Jan 1 2000
const PERIOD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in ms

/**
 * Generate a P1 order ID in the form AA001 → ZZ999, cycling bi-weekly.
 *
 * @param {Date} date        – the current date
 * @param {string} lastId    – previous ID (e.g. "AN213")
 * @returns {string}         – next ID
 */
export function generateP1OrderId(date: Date, lastId: string): string {
  // If no last ID is provided or invalid, start with AA001
  if (!lastId || lastId.trim() === '') {
    return 'AA001';
  }

  // Parse the last order ID
  const match = /^([A-Z])([A-Z])(\d{3})$/.exec(lastId.trim());
  if (!match) {
    return 'AA001'; // Invalid format, start over
  }

  const [, firstLetter, secondLetter, numStr] = match;
  const lastSeq = parseInt(numStr, 10);

  // Simple increment: just increment the sequence number
  const nextSeq = lastSeq + 1;

  // If sequence exceeds 999, advance to next letter combination
  if (nextSeq > 999) {
    // Convert letters to indices (A=0, B=1, ..., Z=25)
    const firstIdx = firstLetter.charCodeAt(0) - 65;
    const secondIdx = secondLetter.charCodeAt(0) - 65;
    
    // Increment second letter first
    let newSecondIdx = secondIdx + 1;
    let newFirstIdx = firstIdx;
    
    // If second letter goes past Z, increment first letter and reset second to A
    if (newSecondIdx > 25) {
      newSecondIdx = 0;
      newFirstIdx = firstIdx + 1;
      
      // If first letter goes past Z, reset to AA
      if (newFirstIdx > 25) {
        newFirstIdx = 0;
      }
    }
    
    const newFirstLetter = String.fromCharCode(65 + newFirstIdx);
    const newSecondLetter = String.fromCharCode(65 + newSecondIdx);
    return newFirstLetter + newSecondLetter + '001';
  }

  // Same letters, just increment sequence
  return firstLetter + secondLetter + String(nextSeq).padStart(3, '0');
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
