// Calculate the correct BASE_DATE so that July 11, 2025 falls in the AN period
const PERIOD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in ms

// We want July 11, 2025 to be in the AN period (period index 13)
// AN = A(0) + N(13) = 0*26 + 13 = period index 13
const targetDate = new Date('2025-07-11');
const targetPeriodIndex = 13; // AN period

// Calculate what the BASE_DATE should be
const baseDateTime = targetDate.getTime() - (targetPeriodIndex * PERIOD_MS);
const calculatedBaseDate = new Date(baseDateTime);

console.log('Target date (July 11, 2025):', targetDate.toISOString().split('T')[0]);
console.log('Target period index (AN):', targetPeriodIndex);
console.log('Calculated BASE_DATE:', calculatedBaseDate.toISOString().split('T')[0]);

// Test with the calculated BASE_DATE
const delta = targetDate.getTime() - calculatedBaseDate.getTime();
const periodIndex = Math.floor(delta / PERIOD_MS);
const firstIdx = Math.floor(periodIndex / 26) % 26;
const secondIdx = periodIndex % 26;
const prefix = String.fromCharCode(65 + firstIdx) + String.fromCharCode(65 + secondIdx);

console.log('Verification:');
console.log('Period index:', periodIndex);
console.log('Calculated prefix:', prefix);
console.log('Matches AN:', prefix === 'AN');

// Test a few dates around July 11 to make sure the period is correct
const testDates = [
  new Date('2025-07-10'),
  new Date('2025-07-11'),
  new Date('2025-07-12'),
  new Date('2025-07-24'), // Should be AO (next period)
  new Date('2025-07-25')
];

console.log('\nTesting multiple dates:');
testDates.forEach(date => {
  const d = date.getTime() - calculatedBaseDate.getTime();
  const pi = Math.floor(d / PERIOD_MS);
  const fi = Math.floor(pi / 26) % 26;
  const si = pi % 26;
  const p = String.fromCharCode(65 + fi) + String.fromCharCode(65 + si);
  console.log(`${date.toISOString().split('T')[0]}: period ${pi}, prefix ${p}`);
});