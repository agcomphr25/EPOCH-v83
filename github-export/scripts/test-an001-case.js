// Test the specific case: AN001 → AN002
const BASE_DATE = new Date(2025, 0, 10); // Jan 10 2025 - aligned with current AN period
const PERIOD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in ms

function generateP1OrderId(date, lastId) {
  // compute how many 14-day periods since BASE_DATE
  const delta = date.getTime() - BASE_DATE.getTime();
  const periodIndex = Math.floor(delta / PERIOD_MS);

  // determine two letters
  const firstIdx = Math.floor(periodIndex / 26) % 26;
  const secondIdx = periodIndex % 26;
  const letter = (i) => String.fromCharCode(65 + i); // 0→A, 25→Z
  const prefix = `${letter(firstIdx)}${letter(secondIdx)}`;

  // parse last numeric part if lastId matches pattern
  const match = /^[A-Z]{2}(\d{3})$/.exec(lastId);
  let seq = 1;
  if (match && lastId.slice(0, 2) === prefix) {
    seq = parseInt(match[1], 10) + 1; // increment within same period-block
  }
  // reset to 1 when letters change or lastId invalid
  const num = String(seq).padStart(3, '0');
  return prefix + num;
}

console.log('=== Testing AN001 → AN002 ===');

// Test with current date (July 11, 2025)
const currentDate = new Date('2025-07-11');
console.log('Current date:', currentDate.toISOString().split('T')[0]);

// Calculate current period
const delta = currentDate.getTime() - BASE_DATE.getTime();
const periodIndex = Math.floor(delta / PERIOD_MS);
const firstIdx = Math.floor(periodIndex / 26) % 26;
const secondIdx = periodIndex % 26;
const letter = (i) => String.fromCharCode(65 + i);
const currentPrefix = `${letter(firstIdx)}${letter(secondIdx)}`;

console.log('Current period prefix:', currentPrefix);
console.log('Period index:', periodIndex);

// Test: AN001 → AN002
const result = generateP1OrderId(currentDate, 'AN001');
console.log('Input: AN001');
console.log('Output:', result);
console.log('Expected: AN002');
console.log('Match:', result === 'AN002' ? '✓ PASS' : '✗ FAIL');