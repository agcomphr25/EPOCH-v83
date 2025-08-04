// Test AP period behavior
const BASE_DATE = new Date(2025, 0, 10); // Jan 10 2025
const PERIOD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in ms

function generateP1OrderId(date, lastId) {
  const delta = date.getTime() - BASE_DATE.getTime();
  const periodIndex = Math.floor(delta / PERIOD_MS);
  const firstIdx = Math.floor(periodIndex / 26) % 26;
  const secondIdx = periodIndex % 26;
  const letter = (i) => String.fromCharCode(65 + i);
  const prefix = `${letter(firstIdx)}${letter(secondIdx)}`;
  const match = /^[A-Z]{2}(\d{3})$/.exec(lastId);
  let seq = 1;
  if (match && lastId.slice(0, 2) === prefix) {
    seq = parseInt(match[1], 10) + 1;
  }
  const num = String(seq).padStart(3, '0');
  return prefix + num;
}

console.log('=== Testing AP Period ===');
console.log('AP001 on August 8, 2025 (AP period start):');
const result1 = generateP1OrderId(new Date('2025-08-08'), 'AP001');
console.log('Result:', result1);

console.log('\nAP005 on August 15, 2025 (middle of AP period):');
const result2 = generateP1OrderId(new Date('2025-08-15'), 'AP005');
console.log('Result:', result2);

console.log('\n=== Testing Current Period ===');
console.log('AN001 on July 11, 2025 (current AN period):');
const result3 = generateP1OrderId(new Date('2025-07-11'), 'AN001');
console.log('Result:', result3);

console.log('\n=== Period Reference ===');
for (let i = 10; i <= 20; i++) {
  const periodStart = new Date(BASE_DATE.getTime() + i * PERIOD_MS);
  const firstIdx = Math.floor(i / 26) % 26;
  const secondIdx = i % 26;
  const letter = (idx) => String.fromCharCode(65 + idx);
  const prefix = `${letter(firstIdx)}${letter(secondIdx)}`;
  console.log(`Period ${i}: ${prefix} (starts ${periodStart.toISOString().split('T')[0]})`);
}