// Debug the AP001 → AM001 issue
const BASE_DATE = new Date(2025, 0, 10); // Jan 10 2025 - aligned with current AN period
const PERIOD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in ms

function generateP1OrderId(date, lastId) {
  console.log('=== Debug P1 Generator ===');
  console.log('Input date:', date.toISOString().split('T')[0]);
  console.log('Input lastId:', lastId);
  
  // compute how many 14-day periods since BASE_DATE
  const delta = date.getTime() - BASE_DATE.getTime();
  const periodIndex = Math.floor(delta / PERIOD_MS);
  console.log('Delta (ms):', delta);
  console.log('Period index:', periodIndex);

  // determine two letters
  const firstIdx = Math.floor(periodIndex / 26) % 26;
  const secondIdx = periodIndex % 26;
  console.log('First index:', firstIdx, '(letter:', String.fromCharCode(65 + firstIdx) + ')');
  console.log('Second index:', secondIdx, '(letter:', String.fromCharCode(65 + secondIdx) + ')');
  
  const letter = (i) => String.fromCharCode(65 + i); // 0→A, 25→Z
  const prefix = `${letter(firstIdx)}${letter(secondIdx)}`;
  console.log('Calculated prefix:', prefix);

  // parse last numeric part if lastId matches pattern
  const match = /^[A-Z]{2}(\d{3})$/.exec(lastId);
  console.log('Regex match:', match);
  
  let seq = 1;
  if (match && lastId.slice(0, 2) === prefix) {
    seq = parseInt(match[1], 10) + 1; // increment within same period-block
    console.log('Same period - incrementing sequence to:', seq);
  } else {
    console.log('Different period or no match - using sequence 1');
    if (match) {
      console.log('LastId prefix:', lastId.slice(0, 2), 'vs calculated prefix:', prefix);
    }
  }
  
  // reset to 1 when letters change or lastId invalid
  const num = String(seq).padStart(3, '0');
  const result = prefix + num;
  console.log('Final result:', result);
  return result;
}

// Test with exact inputs from screenshot
console.log('=== Testing AP001 → ? on July 11, 2025 ===');
const testDate = new Date('2025-07-11');
const testLastId = 'AP001';
const result = generateP1OrderId(testDate, testLastId);
console.log('RESULT:', result);

// Let's also check what period AP should be
console.log('\n=== AP Period Analysis ===');
// AP = A(0) + P(15) = period 15
const apPeriodIndex = 15;
const apPeriodStartDate = new Date(BASE_DATE.getTime() + apPeriodIndex * PERIOD_MS);
console.log('AP period (index 15) starts on:', apPeriodStartDate.toISOString().split('T')[0]);
console.log('AP period ends on:', new Date(apPeriodStartDate.getTime() + PERIOD_MS - 1).toISOString().split('T')[0]);

// Check current period for July 11, 2025
console.log('\n=== Current Period Analysis ===');
const currentDelta = testDate.getTime() - BASE_DATE.getTime();
const currentPeriodIndex = Math.floor(currentDelta / PERIOD_MS);
console.log('July 11, 2025 is in period:', currentPeriodIndex);
const currentPeriodStart = new Date(BASE_DATE.getTime() + currentPeriodIndex * PERIOD_MS);
console.log('Current period starts on:', currentPeriodStart.toISOString().split('T')[0]);