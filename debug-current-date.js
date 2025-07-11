// Debug current date calculation
const BASE_DATE = new Date(2000, 0, 1);
const PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

const today = new Date();
console.log(`Today: ${today.toISOString().split('T')[0]}`);
console.log(`Base Date: ${BASE_DATE.toISOString().split('T')[0]}`);

const delta = today.getTime() - BASE_DATE.getTime();
const currentPeriodIndex = Math.floor(delta / PERIOD_MS);

console.log(`Delta (ms): ${delta}`);
console.log(`Period MS: ${PERIOD_MS}`);
console.log(`Current Period Index: ${currentPeriodIndex}`);

const secondIdx = currentPeriodIndex % 26;
const firstIdx = Math.floor(currentPeriodIndex / 26) % 26;
const letter = (i) => String.fromCharCode(65 + i);

console.log(`First Letter Index: ${firstIdx} (${letter(firstIdx)})`);
console.log(`Second Letter Index: ${secondIdx} (${letter(secondIdx)})`);
console.log(`Current Prefix: ${letter(firstIdx)}${letter(secondIdx)}`);