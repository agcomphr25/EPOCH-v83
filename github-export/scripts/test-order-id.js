// Test the P1 order ID generator with correct pattern
const BASE_DATE = new Date(2000, 0, 1);
const PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

function generateP1OrderId(date, lastId) {
  const delta = date.getTime() - BASE_DATE.getTime();
  const currentPeriodIndex = Math.floor(delta / PERIOD_MS);
  
  // Second letter cycles A-Z every 14 days
  const secondIdx = currentPeriodIndex % 26;
  // First letter advances only after second letter completes full A-Z cycle
  const firstIdx = Math.floor(currentPeriodIndex / 26) % 26;
  const letter = (i) => String.fromCharCode(65 + i);
  const currentPrefix = `${letter(firstIdx)}${letter(secondIdx)}`;
  
  console.log(`Date: ${date.toISOString().split('T')[0]}`);
  console.log(`Period Index: ${currentPeriodIndex}`);
  console.log(`First Letter Index: ${firstIdx} (${letter(firstIdx)})`);
  console.log(`Second Letter Index: ${secondIdx} (${letter(secondIdx)})`);
  console.log(`Current Prefix: ${currentPrefix}`);
  console.log(`Last ID: ${lastId}`);
  
  if (!lastId || lastId.trim() === '') {
    console.log('No last ID - starting with current period + 001');
    return currentPrefix + '001';
  }
  
  const match = /^([A-Z])([A-Z])(\d{3})$/.exec(lastId.trim());
  if (!match) {
    console.log('Invalid last ID format - starting with current period + 001');
    return currentPrefix + '001';
  }
  
  const [, firstLetter, secondLetter, numStr] = match;
  const lastSeq = parseInt(numStr, 10);
  const lastPrefix = firstLetter + secondLetter;
  
  console.log(`Last Prefix: ${lastPrefix}`);
  console.log(`Last Sequence: ${lastSeq}`);
  
  if (lastPrefix === currentPrefix) {
    const nextSeq = lastSeq + 1;
    if (nextSeq > 999) {
      console.log('Sequence exceeded 999 - resetting to 001');
      return currentPrefix + '001';
    }
    console.log(`Same period - incrementing to: ${nextSeq}`);
    return currentPrefix + String(nextSeq).padStart(3, '0');
  } else {
    console.log('Different period - new period starts with 001');
    return currentPrefix + '001';
  }
}

// Test cases to verify the pattern
console.log('=== Test 1: Period 0 (should be AA) ===');
generateP1OrderId(new Date(2000, 0, 1), '');

console.log('\n=== Test 2: Period 1 (should be AB) ===');
generateP1OrderId(new Date(2000, 0, 15), '');

console.log('\n=== Test 3: Period 25 (should be AZ) ===');
generateP1OrderId(new Date(2000, 0, 1 + 25*14), '');

console.log('\n=== Test 4: Period 26 (should be BA) ===');
generateP1OrderId(new Date(2000, 0, 1 + 26*14), '');

console.log('\n=== Test 5: Same period increment ===');
generateP1OrderId(new Date(2000, 0, 1), 'AA005');