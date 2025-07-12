// Simple base date: July 1, 2025 = AP period (period 15)
const BASE_DATE = new Date('2025-07-01'); // July 1, 2025 - AP001 starts here
const BASE_PERIOD_INDEX = 15; // AP period index
const PERIOD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in ms

/**
 * Generate a P1 order ID in the form AA001 → ZZ999, cycling bi-weekly.
 *
 * @param {Date} date        – the current date
 * @param {string} lastId    – previous ID (e.g. "AN213")
 * @returns {string}         – next ID
 */
export function generateP1OrderId(date: Date, lastId: string): string {
  // Calculate periods from base date (July 1, 2025 = AP period)
  const delta = date.getTime() - BASE_DATE.getTime();
  const periodsFromBase = Math.floor(delta / PERIOD_MS);
  const actualPeriodIndex = BASE_PERIOD_INDEX + periodsFromBase;

  // determine two letters based on actual period
  const firstIdx = Math.floor(actualPeriodIndex / 26) % 26;
  const secondIdx = actualPeriodIndex % 26;
  const letter = (i: number) => String.fromCharCode(65 + i); // 0→A, 25→Z
  const prefix = `${letter(firstIdx)}${letter(secondIdx)}`;

  console.log('P1 ID Generation:', {
    date: date.toISOString().split('T')[0],
    lastId: lastId,
    periodsFromBase,
    actualPeriodIndex,
    prefix,
    firstIdx,
    secondIdx,
    note: 'July 1, 2025 = AP001 period'
  });

  // handle empty lastId
  if (!lastId || lastId.trim() === '') {
    console.log('Empty lastId, returning:', prefix + '001');
    return prefix + '001';
  }

  // Check if lastId matches current period's P1 format exactly
  const p1Match = /^[A-Z]{2}(\d{3})$/i.exec(lastId.trim());
  let seq = 1;
  
  console.log('P1 format match result:', p1Match);
  
  if (p1Match && lastId.trim().slice(0, 2).toUpperCase() === prefix) {
    // This is a valid P1 ID for the current period
    const currentSeq = parseInt(p1Match[1], 10);
    seq = currentSeq + 1;
    console.log('Same period P1 ID, incrementing:', lastId.trim(), '→', prefix + String(seq).padStart(3, '0'));
    console.log('Current sequence:', currentSeq, 'Next sequence:', seq);
  } else {
    // Either not P1 format or different period - extract numeric sequence
    const numericMatch = /(\d+)/.exec(lastId.trim());
    if (numericMatch) {
      const extractedNum = parseInt(numericMatch[1], 10);
      seq = extractedNum + 1;
      console.log('Extracted sequence from lastId:', extractedNum, '→', seq);
      console.log('LastId:', lastId.trim(), 'using extracted sequence for new period:', prefix + String(seq).padStart(3, '0'));
    } else {
      console.log('No numeric sequence found in lastId, starting at 001');
    }
  }
  
  // Handle sequence overflow
  if (seq > 999) {
    seq = 1;
    console.log('Sequence overflow, resetting to 001');
  }
  
  const num = String(seq).padStart(3, '0');
  const result = prefix + num;
  console.log('Final result:', result);
  return result;
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
