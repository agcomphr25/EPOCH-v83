// Test the P1 order ID generator
const BASE_DATE = new Date(2000, 0, 1);
const PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

function generateP1OrderId(date, lastId) {
  const delta = date.getTime() - BASE_DATE.getTime();
  const periodIndex = Math.floor(delta / PERIOD_MS);
  
  const secondIdx = periodIndex % 26;
  const firstIdx = Math.floor(periodIndex / 26) % 26;
  const letter = (i) => String.fromCharCode(65 + i);
  const currentPrefix = `${letter(firstIdx)}${letter(secondIdx)}`;
  
  console.log(`Date: ${date.toISOString().split('T')[0]}`);
  console.log(`Period Index: ${periodIndex}`);
  console.log(`First Letter Index: ${firstIdx} (${letter(firstIdx)})`);
  console.log(`Second Letter Index: ${secondIdx} (${letter(secondIdx)})`);
  console.log(`Current Prefix: ${currentPrefix}`);
  console.log(`Last ID: ${lastId}`);
  
  const match = /^[A-Z]{2}(\d{3})$/.exec(lastId);
  let seq = 1;
  
  if (match && lastId.trim() !== '') {
    const lastPrefix = lastId.slice(0, 2);
    const lastSeq = parseInt(match[1], 10);
    
    console.log(`Last Prefix: ${lastPrefix}`);
    console.log(`Last Sequence: ${lastSeq}`);
    
    if (lastPrefix === currentPrefix) {
      seq = lastSeq + 1;
      console.log(`Same period - incrementing to: ${seq}`);
    } else {
      seq = 1;
      console.log(`Different period - resetting to: 1`);
    }
  }
  
  if (seq > 999) {
    seq = 1;
  }
  
  const num = String(seq).padStart(3, '0');
  const result = currentPrefix + num;
  console.log(`Final Result: ${result}`);
  return result;
}

// Test cases
console.log('=== Test 1: Today with empty last ID ===');
generateP1OrderId(new Date(), '');

console.log('\n=== Test 2: Today with AA005 ===');
generateP1OrderId(new Date(), 'AA005');

console.log('\n=== Test 3: Specific date with AA123 ===');
generateP1OrderId(new Date('2025-01-15'), 'AA123');