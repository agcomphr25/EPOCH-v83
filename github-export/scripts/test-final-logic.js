// Test the updated P1 order ID generator
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

console.log('=== Testing Fixed P1 Order ID Generator ===');

// Test with current date (July 11, 2025)
const currentDate = new Date('2025-07-11');
console.log('Current date:', currentDate.toISOString().split('T')[0]);

// Test 1: Empty string
console.log('\nTest 1: Empty string');
const result1 = generateP1OrderId(currentDate, '');
console.log('Result:', result1);

// Test 2: AN001 (same period)
console.log('\nTest 2: AN001');
const result2 = generateP1OrderId(currentDate, 'AN001');
console.log('Result:', result2);

// Test 3: AN005 (same period)
console.log('\nTest 3: AN005');
const result3 = generateP1OrderId(currentDate, 'AN005');
console.log('Result:', result3);

// Test 4: Invalid format
console.log('\nTest 4: Invalid format');
const result4 = generateP1OrderId(currentDate, 'INVALID');
console.log('Result:', result4);

// Test 5: Date 14 days later
console.log('\nTest 5: Date 14 days later (July 25, 2025) with AN001');
const futureDate = new Date('2025-07-25');
const result5 = generateP1OrderId(futureDate, 'AN001');
console.log('Result:', result5);

// Test 6: Different period ID
console.log('\nTest 6: Different period ID (AM001)');
const result6 = generateP1OrderId(currentDate, 'AM001');
console.log('Result:', result6);