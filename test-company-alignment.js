// Test with company-aligned base date
const BASE_DATE = new Date(2025, 0, 10);
const PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

function getNextPeriodPrefix(firstLetter, secondLetter, periodsToAdvance = 1) {
  let firstIdx = firstLetter.charCodeAt(0) - 65;
  let secondIdx = secondLetter.charCodeAt(0) - 65;
  
  secondIdx += periodsToAdvance;
  
  while (secondIdx > 25) {
    secondIdx -= 26;
    firstIdx++;
  }
  
  if (firstIdx > 25) {
    firstIdx = firstIdx % 26;
  }
  
  const letter = (i) => String.fromCharCode(65 + i);
  return letter(firstIdx) + letter(secondIdx);
}

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

  const lastFirstIdx = firstLetter.charCodeAt(0) - 65;
  const lastSecondIdx = secondLetter.charCodeAt(0) - 65;
  const lastPeriodIndex = lastFirstIdx * 26 + lastSecondIdx;
  const lastPeriodDate = new Date(BASE_DATE.getTime() + lastPeriodIndex * PERIOD_MS);

  const timeSinceLastPeriod = date.getTime() - lastPeriodDate.getTime();
  const periodsElapsed = Math.floor(timeSinceLastPeriod / PERIOD_MS);

  console.log(`Date: ${date.toISOString().split('T')[0]}`);
  console.log(`Last ID: ${lastId}`);
  console.log(`Periods Elapsed: ${periodsElapsed}`);

  if (periodsElapsed === 0) {
    const nextSeq = lastSeq + 1;
    if (nextSeq > 999) {
      const nextPrefix = getNextPeriodPrefix(firstLetter, secondLetter);
      console.log(`Result: ${nextPrefix}001`);
      return nextPrefix + '001';
    }
    const result = firstLetter + secondLetter + String(nextSeq).padStart(3, '0');
    console.log(`Result: ${result}`);
    return result;
  } else {
    const nextPrefix = getNextPeriodPrefix(firstLetter, secondLetter, periodsElapsed);
    console.log(`Result: ${nextPrefix}001`);
    return nextPrefix + '001';
  }
}

// Test with current company status
console.log('=== Test with current company period AN001 ===');
generateP1OrderId(new Date(), 'AN001');

console.log('\n=== Test with AN005 (should increment) ===');
generateP1OrderId(new Date(), 'AN005');

console.log('\n=== Test with AN999 (should advance to AO001) ===');
generateP1OrderId(new Date(), 'AN999');

console.log('\n=== Current period verification ===');
const today = new Date();
const delta = today.getTime() - BASE_DATE.getTime();
const periodIndex = Math.floor(delta / PERIOD_MS);
const secondIdx = periodIndex % 26;
const firstIdx = Math.floor(periodIndex / 26) % 26;
const letter = (i) => String.fromCharCode(65 + i);
const currentPrefix = `${letter(firstIdx)}${letter(secondIdx)}`;
console.log(`Current period should be AN: ${currentPrefix}`);