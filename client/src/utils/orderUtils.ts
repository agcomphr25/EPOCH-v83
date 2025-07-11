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
  // Calculate current 14-day period from base date
  const delta = date.getTime() - BASE_DATE.getTime();
  const currentPeriodIndex = Math.floor(delta / PERIOD_MS);
  
  // Calculate current period prefix (letters)
  // Second letter cycles A-Z every 14 days (period 0=A, 1=B, 2=C, ..., 25=Z, 26=A again)
  const secondIdx = currentPeriodIndex % 26;
  // First letter advances only after second letter completes full A-Z cycle (every 26 periods)
  const firstIdx = Math.floor(currentPeriodIndex / 26) % 26;
  const letter = (i: number) => String.fromCharCode(65 + i);
  const currentPrefix = `${letter(firstIdx)}${letter(secondIdx)}`;

  // If no last ID is provided or invalid, start with current period + 001
  if (!lastId || lastId.trim() === '') {
    return currentPrefix + '001';
  }

  // Parse the last order ID
  const match = /^([A-Z])([A-Z])(\d{3})$/.exec(lastId.trim());
  if (!match) {
    return currentPrefix + '001'; // Invalid format, start with current period
  }

  const [, firstLetter, secondLetter, numStr] = match;
  const lastSeq = parseInt(numStr, 10);
  const lastPrefix = firstLetter + secondLetter;

  // Check if we're in the same 14-day period as the last order
  if (lastPrefix === currentPrefix) {
    // Same period: increment the sequence number
    const nextSeq = lastSeq + 1;
    if (nextSeq > 999) {
      // If sequence exceeds 999 in same period, reset to 001
      return currentPrefix + '001';
    }
    return currentPrefix + String(nextSeq).padStart(3, '0');
  } else {
    // Different period: new period always starts with 001
    return currentPrefix + '001';
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
