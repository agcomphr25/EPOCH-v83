// Test the 14 days out scenario
const BASE_DATE = new Date(2025, 0, 10); // Jan 10 2025
const PERIOD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in ms

function generateP1OrderId(date, lastId) {
  console.log('=== Function called ===');
  console.log('date:', date.toISOString().split('T')[0]);
  console.log('lastId:', lastId);
  
  // compute how many 14-day periods since BASE_DATE
  const delta = date.getTime() - BASE_DATE.getTime();
  const periodIndex = Math.floor(delta / PERIOD_MS);
  console.log('delta:', delta, 'periodIndex:', periodIndex);

  // determine two letters
  const firstIdx = Math.floor(periodIndex / 26) % 26;
  const secondIdx = periodIndex % 26;
  console.log('firstIdx:', firstIdx, 'secondIdx:', secondIdx);
  
  const letter = (i) => String.fromCharCode(65 + i); // 0→A, 25→Z
  const prefix = `${letter(firstIdx)}${letter(secondIdx)}`;
  console.log('prefix:', prefix);

  // parse last numeric part if lastId matches pattern
  const match = /^[A-Z]{2}(\d{3})$/.exec(lastId);
  console.log('regex match:', match);
  
  let seq = 1;
  if (match && lastId.slice(0, 2) === prefix) {
    seq = parseInt(match[1], 10) + 1; // increment within same period-block
    console.log('same period, seq incremented to:', seq);
  } else {
    console.log('different period or no match, seq remains 1');
  }
  
  // reset to 1 when letters change or lastId invalid
  const num = String(seq).padStart(3, '0');
  const result = prefix + num;
  console.log('final result:', result);
  return result;
}

// Test with July 11, 2025 (current AN period)
const currentDate = new Date('2025-07-11');
console.log('=== Current date (July 11, 2025) with AN001 ===');
const result1 = generateP1OrderId(currentDate, 'AN001');
console.log('Result:', result1);

// Test with July 25, 2025 (14 days later - should be AO period)  
const futureDate = new Date('2025-07-25');
console.log('\n=== 14 days later (July 25, 2025) with AN001 ===');
const result2 = generateP1OrderId(futureDate, 'AN001');
console.log('Result:', result2);

// Test what the next period after AN should be
console.log('\n=== Period calculations ===');
const currentPeriod = 13; // AN
const nextPeriod = 14; // Should be AO
const nextFirstIdx = Math.floor(nextPeriod / 26) % 26;
const nextSecondIdx = nextPeriod % 26;
const nextPrefix = String.fromCharCode(65 + nextFirstIdx) + String.fromCharCode(65 + nextSecondIdx);
console.log('Current period (13):', 'AN');
console.log('Next period (14):', nextPrefix);