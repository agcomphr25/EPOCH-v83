// Test the simplified system
const BASE_DATE = new Date(2025, 6, 1); // July 1, 2025
const PERIOD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in ms

console.log('=== Test Simplified System ===');
console.log('July 1, 2025 should be AP period');

// Calculate what period July 1, 2025 should be for AP
// AP = A(0) + P(15) = period 15
// So July 1, 2025 should be period 15

const testDate = new Date('2025-07-01');
const delta = testDate.getTime() - BASE_DATE.getTime();
const periodsFromBase = Math.floor(delta / PERIOD_MS);
console.log('Periods from base:', periodsFromBase);

// Since July 1 IS the base date, periodsFromBase should be 0
// So actualPeriodIndex should be 15 + 0 = 15
const actualPeriodIndex = 15 + periodsFromBase;
console.log('Actual period index:', actualPeriodIndex);

const firstIdx = Math.floor(actualPeriodIndex / 26) % 26;
const secondIdx = actualPeriodIndex % 26;
const letter = (i) => String.fromCharCode(65 + i);
const prefix = `${letter(firstIdx)}${letter(secondIdx)}`;
console.log('Prefix:', prefix);

// Test a few more dates
console.log('\n=== Test July 15, 2025 (same period) ===');
const july15 = new Date('2025-07-15');
const delta15 = july15.getTime() - BASE_DATE.getTime();
const periods15 = Math.floor(delta15 / PERIOD_MS);
const actualPeriod15 = 15 + periods15;
const firstIdx15 = Math.floor(actualPeriod15 / 26) % 26;
const secondIdx15 = actualPeriod15 % 26;
const prefix15 = `${letter(firstIdx15)}${letter(secondIdx15)}`;
console.log('July 15, 2025 - Periods from base:', periods15, 'Prefix:', prefix15);

console.log('\n=== Test July 25, 2025 (next period) ===');
const july25 = new Date('2025-07-25');
const delta25 = july25.getTime() - BASE_DATE.getTime();
const periods25 = Math.floor(delta25 / PERIOD_MS);
const actualPeriod25 = 15 + periods25;
const firstIdx25 = Math.floor(actualPeriod25 / 26) % 26;
const secondIdx25 = actualPeriod25 % 26;
const prefix25 = `${letter(firstIdx25)}${letter(secondIdx25)}`;
console.log('July 25, 2025 - Periods from base:', periods25, 'Prefix:', prefix25);