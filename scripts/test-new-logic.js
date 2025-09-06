// Test the new P1 order ID generator logic
const BASE_DATE = new Date(2000, 0, 1);
const PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

function generateP1OrderId(date, lastId) {
  if (!lastId || lastId.trim() === '') {
    return 'AA001';
  }

  const match = /^([A-Z])([A-Z])(\d{3})$/.exec(lastId.trim());
  if (!match) {
    return 'AA001';
  }

  const [, firstLetter, secondLetter, numStr] = match;
  const lastSeq = parseInt(numStr, 10);

  const delta = date.getTime() - BASE_DATE.getTime();
  const currentPeriodIndex = Math.floor(delta / PERIOD_MS);
  
  const secondIdx = currentPeriodIndex % 26;
  const firstIdx = Math.floor(currentPeriodIndex / 26) % 26;
  const letter = (i) => String.fromCharCode(65 + i);
  const currentPrefix = `${letter(firstIdx)}${letter(secondIdx)}`;

  const lastFirstIdx = firstLetter.charCodeAt(0) - 65;
  const lastSecondIdx = secondLetter.charCodeAt(0) - 65;
  const lastPeriodIndex = lastFirstIdx * 26 + lastSecondIdx;

  console.log(`Date: ${date.toISOString().split('T')[0]}`);
  console.log(`Current Period Index: ${currentPeriodIndex}`);
  console.log(`Current Prefix: ${currentPrefix}`);
  console.log(`Last ID: ${lastId}`);
  console.log(`Last Period Index: ${lastPeriodIndex}`);
  console.log(`Same Period: ${currentPeriodIndex === lastPeriodIndex}`);

  if (currentPeriodIndex !== lastPeriodIndex) {
    console.log(`Different period - using current prefix: ${currentPrefix}001`);
    return currentPrefix + '001';
  } else {
    const nextSeq = lastSeq + 1;
    if (nextSeq > 999) {
      return currentPrefix + '001';
    }
    console.log(`Same period - incrementing: ${firstLetter}${secondLetter}${String(nextSeq).padStart(3, '0')}`);
    return firstLetter + secondLetter + String(nextSeq).padStart(3, '0');
  }
}

// Test with today's date and AA005
console.log('=== Test with today and AA005 ===');
generateP1OrderId(new Date(), 'AA005');

console.log('\n=== Test with today and AB100 ===');
generateP1OrderId(new Date(), 'AB100');

console.log('\n=== Test with empty ID ===');
generateP1OrderId(new Date(), '');