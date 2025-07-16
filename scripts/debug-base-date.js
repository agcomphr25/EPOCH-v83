// Debug the base date calculation
const BASE_DATE = new Date(2025, 6, 1); // July 1, 2025
const PERIOD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in ms

console.log('Base date:', BASE_DATE.toISOString());
console.log('Base date simple:', BASE_DATE.toISOString().split('T')[0]);

// Test July 1, 2025
const testDate = new Date('2025-07-01');
console.log('Test date:', testDate.toISOString());
console.log('Test date simple:', testDate.toISOString().split('T')[0]);

const delta = testDate.getTime() - BASE_DATE.getTime();
console.log('Delta:', delta);
console.log('Delta in hours:', delta / (1000 * 60 * 60));

// The issue might be timezone
const BASE_DATE_SIMPLE = new Date('2025-07-01');
console.log('Base date simple version:', BASE_DATE_SIMPLE.toISOString());

const delta2 = testDate.getTime() - BASE_DATE_SIMPLE.getTime();
console.log('Delta with simple base:', delta2);
console.log('Periods from base:', Math.floor(delta2 / PERIOD_MS));