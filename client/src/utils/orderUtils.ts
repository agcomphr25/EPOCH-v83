// Reference start date for bi-weekly cycles (adjusted to align with current company period AN001)
const BASE_DATE = new Date(2025, 0, 10); // Jan 10 2025 - aligned with current AN period
const PERIOD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in ms

/**
 * Generate a P1 order ID in the form AA001 → ZZ999, cycling bi-weekly.
 *
 * @param {Date} date        – the current date
 * @param {string} lastId    – previous ID (e.g. "AN213")
 * @returns {string}         – next ID
 */
export function generateP1OrderId(date: Date, lastId: string): string {
  console.log('=== Utils Function Debug ===');
  console.log('date:', date);
  console.log('lastId:', lastId);
  console.log('BASE_DATE:', BASE_DATE);
  
  // compute how many 14-day periods since BASE_DATE
  const delta = date.getTime() - BASE_DATE.getTime();
  const periodIndex = Math.floor(delta / PERIOD_MS);
  console.log('delta:', delta);
  console.log('periodIndex:', periodIndex);

  // determine two letters
  const firstIdx = Math.floor(periodIndex / 26) % 26;
  const secondIdx = periodIndex % 26;
  console.log('firstIdx:', firstIdx, 'secondIdx:', secondIdx);
  
  const letter = (i: number) => String.fromCharCode(65 + i); // 0→A, 25→Z
  const prefix = `${letter(firstIdx)}${letter(secondIdx)}`;
  console.log('prefix:', prefix);

  // parse last numeric part if lastId matches pattern
  const match = /^[A-Z]{2}(\d{3})$/.exec(lastId);
  console.log('regex match:', match);
  
  let seq = 1;
  if (match && lastId.slice(0, 2) === prefix) {
    seq = parseInt(match[1], 10) + 1; // increment within same period-block
    console.log('same period, incrementing seq to:', seq);
  } else {
    console.log('different period or no match, using seq 1');
  }
  
  // reset to 1 when letters change or lastId invalid
  const num = String(seq).padStart(3, '0');
  const result = prefix + num;
  console.log('final result:', result);
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
