// Debug current date period calculation
const BASE_DATE = new Date(2025, 0, 10); // Jan 10 2025
const PERIOD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in ms

const today = new Date();
console.log('Today:', today.toISOString().split('T')[0]);
console.log('BASE_DATE:', BASE_DATE.toISOString().split('T')[0]);

const delta = today.getTime() - BASE_DATE.getTime();
const periodIndex = Math.floor(delta / PERIOD_MS);

console.log('Delta (ms):', delta);
console.log('Period index:', periodIndex);

const firstIdx = Math.floor(periodIndex / 26) % 26;
const secondIdx = periodIndex % 26;

console.log('First index:', firstIdx, '(letter: ' + String.fromCharCode(65 + firstIdx) + ')');
console.log('Second index:', secondIdx, '(letter: ' + String.fromCharCode(65 + secondIdx) + ')');

const prefix = String.fromCharCode(65 + firstIdx) + String.fromCharCode(65 + secondIdx);
console.log('Current prefix:', prefix);

// Check if AN001 is in the current period
console.log('\nTesting AN001:');
console.log('AN prefix matches current prefix:', 'AN' === prefix);