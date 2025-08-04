// Test the P1 order ID generator with debugging to see what's happening
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
  
  // If no last ID is provided or invalid, start with AA001
  if (!lastId || lastId.trim() === '') {
    console.log('No last ID provided, returning AA001');
    return 'AA001';
  }

  // Parse the last order ID
  const match = /^([A-Z])([A-Z])(\d{3})$/.exec(lastId.trim());
  if (!match) {
    console.log('Invalid format, returning AA001');
    return 'AA001'; // Invalid format, start with AA001
  }

  const [, firstLetter, secondLetter, numStr] = match;
  const lastSeq = parseInt(numStr, 10);
  console.log('Parsed last ID:', { firstLetter, secondLetter, lastSeq });

  // Calculate when the last order period would have been (reverse calculation)
  const lastFirstIdx = firstLetter.charCodeAt(0) - 65;
  const lastSecondIdx = secondLetter.charCodeAt(0) - 65;
  const lastPeriodIndex = lastFirstIdx * 26 + lastSecondIdx;
  const lastPeriodDate = new Date(BASE_DATE.getTime() + lastPeriodIndex * PERIOD_MS);

  // Check if we're still in the same 14-day period as the last order
  const timeSinceLastPeriod = date.getTime() - lastPeriodDate.getTime();
  const periodsElapsed = Math.floor(timeSinceLastPeriod / PERIOD_MS);
  
  console.log('Period calculation:', { 
    lastPeriodIndex, 
    lastPeriodDate: lastPeriodDate.toISOString().split('T')[0], 
    periodsElapsed 
  });

  if (periodsElapsed === 0) {
    // Same period: increment the sequence
    const nextSeq = lastSeq + 1;
    if (nextSeq > 999) {
      // If sequence exceeds 999, advance to next period
      const result = getNextPeriodPrefix(firstLetter, secondLetter) + '001';
      console.log('Sequence > 999, advancing to:', result);
      return result;
    }
    const result = firstLetter + secondLetter + String(nextSeq).padStart(3, '0');
    console.log('Same period, incrementing to:', result);
    return result;
  } else {
    // Different period: advance the letters based on periods elapsed
    const result = getNextPeriodPrefix(firstLetter, secondLetter, periodsElapsed) + '001';
    console.log('Different period, advancing to:', result);
    return result;
  }
}

// Test with different scenarios
console.log('=== Test 1: Empty string ===');
const result1 = generateP1OrderId(new Date(), '');

console.log('\n=== Test 2: AN001 ===');
const result2 = generateP1OrderId(new Date(), 'AN001');

console.log('\n=== Test 3: AN005 ===');
const result3 = generateP1OrderId(new Date(), 'AN005');

console.log('\n=== Test 4: Invalid format ===');
const result4 = generateP1OrderId(new Date(), 'INVALID');

console.log('\n=== Test 5: Spaces ===');
const result5 = generateP1OrderId(new Date(), ' AN001 ');