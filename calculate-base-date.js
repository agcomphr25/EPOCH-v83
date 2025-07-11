// Calculate the correct base date for AN001
const PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

// AN = A(0) + N(13) = period 13
// So if we're currently at period 13, we need to work backwards
const currentPeriod = 13;
const today = new Date();
const baseDate = new Date(today.getTime() - currentPeriod * PERIOD_MS);

console.log(`Today: ${today.toISOString().split('T')[0]}`);
console.log(`Current Period: ${currentPeriod} (AN)`);
console.log(`Calculated Base Date: ${baseDate.toISOString().split('T')[0]}`);

// Test with this base date
const BASE_DATE = baseDate;
const delta = today.getTime() - BASE_DATE.getTime();
const periodIndex = Math.floor(delta / PERIOD_MS);
const secondIdx = periodIndex % 26;
const firstIdx = Math.floor(periodIndex / 26) % 26;
const letter = (i) => String.fromCharCode(65 + i);
const prefix = `${letter(firstIdx)}${letter(secondIdx)}`;

console.log(`Verification - Current prefix should be AN: ${prefix}`);
console.log(`Period Index: ${periodIndex}`);