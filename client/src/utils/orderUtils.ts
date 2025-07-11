// Reference start date for bi-weekly cycles (calculated so July 1, 2025 = AP period)
// AP = period 15 (A=0, P=15), so July 1, 2025 should be 15 periods from base date
const BASE_DATE = new Date(2024, 11, 13); // Dec 13 2024 - calculated to align July 1, 2025 with AP period
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

  // determine two letters
  const firstIdx = Math.floor(periodIndex / 26) % 26;
  const secondIdx = periodIndex % 26;
  const letter = (i: number) => String.fromCharCode(65 + i); // 0→A, 25→Z
  const prefix = `${letter(firstIdx)}${letter(secondIdx)}`;

  console.log('P1 ID Generation:', {
    date: date.toISOString().split('T')[0],
    lastId: lastId,
    periodIndex,
    prefix,
    firstIdx,
    secondIdx,
    note: 'App started July 1, 2025 with AP001'
  });

  // handle empty or invalid lastId
  if (!lastId || lastId.trim() === '') {
    console.log('Empty lastId, returning:', prefix + '001');
    return prefix + '001';
  }

  // parse last numeric part if lastId matches pattern
  const match = /^[A-Z]{2}(\d{3})$/.exec(lastId.trim());
  let seq = 1;
  
  console.log('Regex match result:', match);
  console.log('LastId prefix:', lastId.trim().slice(0, 2));
  console.log('Current prefix:', prefix);
  console.log('Prefixes match:', lastId.trim().slice(0, 2) === prefix);
  
  if (match && lastId.trim().slice(0, 2) === prefix) {
    const currentSeq = parseInt(match[1], 10);
    seq = currentSeq + 1;
    console.log('Same period, incrementing:', lastId.trim(), '→', prefix + String(seq).padStart(3, '0'));
    console.log('Current sequence:', currentSeq, 'Next sequence:', seq);
  } else {
    console.log('Different period or invalid format, resetting to:', prefix + '001');
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
