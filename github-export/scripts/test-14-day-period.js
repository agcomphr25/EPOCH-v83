// Test P1 order ID generator with 14-day period change
const BASE_DATE = new Date(2025, 0, 10); // Jan 10 2025
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
  console.log('P1 Generator called with:', { date: date.toISOString(), lastId });
  
  if (!lastId || lastId.trim() === '') {
    console.log('No last ID provided, returning AA001');
    return 'AA001';
  }

  const match = /^([A-Z])([A-Z])(\d{3})$/.exec(lastId.trim());
  if (!match) {
    console.log('Invalid format, returning AA001');
    return 'AA001';
  }

  const [, firstLetter, secondLetter, numStr] = match;
  const lastSeq = parseInt(numStr, 10);
  console.log('Parsed last ID:', { firstLetter, secondLetter, lastSeq });

  const lastFirstIdx = firstLetter.charCodeAt(0) - 65;
  const lastSecondIdx = secondLetter.charCodeAt(0) - 65;
  const lastPeriodIndex = lastFirstIdx * 26 + lastSecondIdx;
  const lastPeriodDate = new Date(BASE_DATE.getTime() + lastPeriodIndex * PERIOD_MS);

  const timeSinceLastPeriod = date.getTime() - lastPeriodDate.getTime();
  const periodsElapsed = Math.floor(timeSinceLastPeriod / PERIOD_MS);
  
  console.log('Period calculation:', { 
    lastPeriodIndex, 
    lastPeriodDate: lastPeriodDate.toISOString().split('T')[0], 
    periodsElapsed 
  });

  if (periodsElapsed === 0) {
    const nextSeq = lastSeq + 1;
    if (nextSeq > 999) {
      const result = getNextPeriodPrefix(firstLetter, secondLetter) + '001';
      console.log('Sequence > 999, advancing to:', result);
      return result;
    }
    const result = firstLetter + secondLetter + String(nextSeq).padStart(3, '0');
    console.log('Same period, incrementing to:', result);
    return result;
  } else {
    const result = getNextPeriodPrefix(firstLetter, secondLetter, periodsElapsed) + '001';
    console.log('Different period, advancing to:', result);
    return result;
  }
}

// Test with current date and AN001 (should be same period)
console.log('=== Test 1: Current date (July 11, 2025) with AN001 ===');
const currentDate = new Date('2025-07-11');
const result1 = generateP1OrderId(currentDate, 'AN001');
console.log('Result:', result1);

// Test with date 14 days later (should advance to next period)
console.log('\n=== Test 2: Date 14 days later (July 25, 2025) with AN001 ===');
const futureDate = new Date('2025-07-25');
const result2 = generateP1OrderId(futureDate, 'AN001');
console.log('Result:', result2);

// Test with date 28 days later (should advance 2 periods)
console.log('\n=== Test 3: Date 28 days later (August 8, 2025) with AN001 ===');
const furtherDate = new Date('2025-08-08');
const result3 = generateP1OrderId(furtherDate, 'AN001');
console.log('Result:', result3);

// Test with AN050 and 14 days later
console.log('\n=== Test 4: Date 14 days later with AN050 ===');
const result4 = generateP1OrderId(futureDate, 'AN050');
console.log('Result:', result4);