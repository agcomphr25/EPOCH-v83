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
  // compute how many 14-day periods since BASE_DATE
  const delta = date.getTime() - BASE_DATE.getTime();
  const periodIndex = Math.floor(delta / PERIOD_MS);

  // determine two letters - second letter cycles every 14 days, first letter advances every 26 periods
  const secondIdx = periodIndex % 26; // cycles A-Z every 14 days
  const firstIdx = Math.floor(periodIndex / 26) % 26; // advances when second letter completes A-Z cycle
  const letter = (i: number) => String.fromCharCode(65 + i); // 0→A, 25→Z
  const currentPrefix = `${letter(firstIdx)}${letter(secondIdx)}`;

  // parse last order ID if provided and valid
  const match = /^[A-Z]{2}(\d{3})$/.exec(lastId);
  let seq = 1;
  
  if (match && lastId.trim() !== '') {
    const lastPrefix = lastId.slice(0, 2);
    const lastSeq = parseInt(match[1], 10);
    
    if (lastPrefix === currentPrefix) {
      // Same 14-day period, increment the sequence
      seq = lastSeq + 1;
    } else {
      // Different period, reset to 1
      seq = 1;
    }
  }
  
  // ensure sequence doesn't exceed 999
  if (seq > 999) {
    seq = 1;
  }
  
  const num = String(seq).padStart(3, '0');
  return currentPrefix + num;
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
