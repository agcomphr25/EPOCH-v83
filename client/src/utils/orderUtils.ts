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
  console.log('P1 Generator called with:', { date: date.toISOString(), lastId });
  
  // If no last ID is provided or invalid, start with AA001
  if (!lastId || lastId.trim() === '') {
    console.log('No last ID provided, returning AA001');
    return 'AA001';
  }

  // Parse the last order ID
  const match = /^([A-Z])([A-Z])(\d{3})$/.exec(lastId.trim());
  if (!match) {
    console.log('Invalid format, returning AA001');
    return 'AA001'; // Invalid format, start with AA001
  }

  const [, firstLetter, secondLetter, numStr] = match;
  const lastSeq = parseInt(numStr, 10);
  console.log('Parsed last ID:', { firstLetter, secondLetter, lastSeq });

  // Calculate when the last order period would have been (reverse calculation)
  const lastFirstIdx = firstLetter.charCodeAt(0) - 65;
  const lastSecondIdx = secondLetter.charCodeAt(0) - 65;
  const lastPeriodIndex = lastFirstIdx * 26 + lastSecondIdx;
  const lastPeriodDate = new Date(BASE_DATE.getTime() + lastPeriodIndex * PERIOD_MS);

  // Check if we're still in the same 14-day period as the last order
  const timeSinceLastPeriod = date.getTime() - lastPeriodDate.getTime();
  const periodsElapsed = Math.floor(timeSinceLastPeriod / PERIOD_MS);
  
  console.log('Period calculation:', { 
    lastPeriodIndex, 
    lastPeriodDate: lastPeriodDate.toISOString().split('T')[0], 
    periodsElapsed 
  });

  if (periodsElapsed === 0) {
    // Same period: increment the sequence
    const nextSeq = lastSeq + 1;
    if (nextSeq > 999) {
      // If sequence exceeds 999, advance to next period
      const result = getNextPeriodPrefix(firstLetter, secondLetter) + '001';
      console.log('Sequence > 999, advancing to:', result);
      return result;
    }
    const result = firstLetter + secondLetter + String(nextSeq).padStart(3, '0');
    console.log('Same period, incrementing to:', result);
    return result;
  } else {
    // Different period: advance the letters based on periods elapsed
    const result = getNextPeriodPrefix(firstLetter, secondLetter, periodsElapsed) + '001';
    console.log('Different period, advancing to:', result);
    return result;
  }
}

function getNextPeriodPrefix(firstLetter: string, secondLetter: string, periodsToAdvance: number = 1): string {
  let firstIdx = firstLetter.charCodeAt(0) - 65;
  let secondIdx = secondLetter.charCodeAt(0) - 65;
  
  // Advance by the number of periods
  secondIdx += periodsToAdvance;
  
  // Handle overflow: if second letter goes past Z, increment first letter
  while (secondIdx > 25) {
    secondIdx -= 26;
    firstIdx++;
  }
  
  // Handle first letter overflow
  if (firstIdx > 25) {
    firstIdx = firstIdx % 26;
  }
  
  const letter = (i: number) => String.fromCharCode(65 + i);
  return letter(firstIdx) + letter(secondIdx);
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
