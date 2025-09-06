#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ORDER_ENTRY_PATH = path.join(__dirname, '../client/src/components/OrderEntry.tsx');

function checkDataConsistency() {
  if (!fs.existsSync(ORDER_ENTRY_PATH)) {
    console.error('❌ OrderEntry.tsx not found');
    process.exit(1);
  }

  const content = fs.readFileSync(ORDER_ENTRY_PATH, 'utf8');
  const lines = content.split('\n');
  
  const issues = [];
  
  // Check for problematic patterns
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    
    // Check for bottomMetal usage in Order Summary or price calculation
    if (line.includes('bottomMetal') && !line.includes('features.bottom_metal') && !line.includes('const [bottomMetal') && !line.includes('setBottomMetal')) {
      issues.push(`Line ${lineNum}: Using 'bottomMetal' instead of 'features.bottom_metal' - ${line.trim()}`);
    }
    
    // Check for otherOptions usage in Order Summary or price calculation
    if (line.includes('otherOptions') && !line.includes('features.other_options') && !line.includes('const [otherOptions') && !line.includes('setOtherOptions')) {
      issues.push(`Line ${lineNum}: Using 'otherOptions' instead of 'features.other_options' - ${line.trim()}`);
    }
    
    // Check for railAccessory usage in Order Summary or price calculation
    if (line.includes('railAccessory') && !line.includes('features.rail_accessory') && !line.includes('const [railAccessory') && !line.includes('setRailAccessory')) {
      issues.push(`Line ${lineNum}: Using 'railAccessory' instead of 'features.rail_accessory' - ${line.trim()}`);
    }
    
    // Check dependency arrays for separate state variables
    if (line.includes('bottomMetal, paintOptions, railAccessory, otherOptions') || 
        line.includes('], [modelOptions, modelId, priceOverride, featureDefs, features, bottomMetal')) {
      issues.push(`Line ${lineNum}: Dependency array includes separate state variables instead of just 'features' - ${line.trim()}`);
    }
  });
  
  if (issues.length === 0) {
    console.log('✅ OrderEntry.tsx data consistency check passed');
    console.log('✅ All Order Summary and price calculations use features object correctly');
    return true;
  } else {
    console.log('🚨 OrderEntry.tsx Data Consistency Issues Found:');
    console.log('');
    issues.forEach(issue => console.log(`❌ ${issue}`));
    console.log('');
    console.log('💡 Fix: Update the identified lines to use features object instead of separate state variables');
    console.log('📖 See: docs/ORDER_ENTRY_DATA_CONSISTENCY.md for complete guidance');
    return false;
  }
}

if (require.main === module) {
  const isValid = checkDataConsistency();
  process.exit(isValid ? 0 : 1);
}

module.exports = { checkDataConsistency };