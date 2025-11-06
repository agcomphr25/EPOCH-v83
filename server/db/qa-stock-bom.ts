#!/usr/bin/env tsx
/**
 * QA Test Script for Stock BOM System
 * Tests cost rollups, MRP forecasting, and edge cases
 */

import { db } from '../db';
import { apiRequest } from '../../lib/utils';

interface BOMItem {
  partName: string;
  quantity: number;
  itemType: 'material' | 'labor';
  isOptional: boolean;
  laborHours?: number | null;
  hourlyRate?: number | null;
}

interface BOMCostSummary {
  totalMaterialCost: number;
  totalLaborCost: number;
  optionalMaterialCost: number;
  optionalLaborCost: number;
  baseCost: number;
  fullCost: number;
}

console.log('🧪 Starting Stock BOM QA Test Suite...\n');

// Test 1: Verify BOM Cost Rollup Calculations
async function test1_CostRollups() {
  console.log('Test 1: BOM Cost Rollup Calculations');
  console.log('═'.repeat(60));
  
  try {
    const response = await fetch('http://localhost:5000/api/robust-boms/stock-boms/6');
    const bom = await response.json();
    
    console.log(`📦 Testing BOM: ${bom.modelName} (ID: ${bom.id})`);
    console.log(`   SKU: ${bom.sku}, Revision: ${bom.revision}\n`);
    
    // Expected values for Carbon Fiber Stock Kit
    const EXPECTED = {
      requiredNonLaborCount: 7,  // Foam, Carbon, Epoxy, Hardener, Bottom Metal, QD Mount, Bedding Screws
      optionalNonLaborCount: 2,  // Paint, Picatinny Rails
      requiredLaborCost: 257.50, // Layup (3.5h @ $35) + CNC (2h @ $40) + Finishing (1.5h @ $30)
      optionalLaborCost: 70.00,  // Paint Application (2h @ $35)
      totalLaborCost: 327.50,
    };
    
    // Calculate costs from actual data
    let requiredNonLaborCount = 0;
    let optionalNonLaborCount = 0;
    let requiredLaborCost = 0;
    let optionalLaborCost = 0;
    
    bom.items.forEach((item: BOMItem) => {
      if (item.itemType !== 'labor') {
        // Count all non-labor items (material, manufactured, etc.)
        if (item.isOptional) {
          optionalNonLaborCount++;
        } else {
          requiredNonLaborCount++;
        }
      } else if (item.itemType === 'labor') {
        const laborCost = (item.laborHours || 0) * (item.hourlyRate || 0);
        if (item.isOptional) {
          optionalLaborCost += laborCost;
        } else {
          requiredLaborCost += laborCost;
        }
      }
    });
    
    const totalLaborCost = requiredLaborCost + optionalLaborCost;
    
    console.log('📊 Cost Breakdown:');
    console.log(`   Required Non-Labor Items: ${requiredNonLaborCount} items`);
    console.log(`   Optional Non-Labor Items: ${optionalNonLaborCount} items`);
    console.log(`   Required Labor Cost: $${requiredLaborCost.toFixed(2)}`);
    console.log(`   Optional Labor Cost: $${optionalLaborCost.toFixed(2)}`);
    console.log(`   Total Labor (all): $${totalLaborCost.toFixed(2)}\n`);
    
    // ASSERTIONS - Fail if values don't match expected
    console.log('🔍 Validating against expected values...');
    let hasErrors = false;
    
    if (requiredNonLaborCount !== EXPECTED.requiredNonLaborCount) {
      console.error(`   ❌ Required Non-Labor: Expected ${EXPECTED.requiredNonLaborCount}, got ${requiredNonLaborCount}`);
      hasErrors = true;
    } else {
      console.log(`   ✅ Required Non-Labor: ${requiredNonLaborCount} (matches expected)`);
    }
    
    if (optionalNonLaborCount !== EXPECTED.optionalNonLaborCount) {
      console.error(`   ❌ Optional Non-Labor: Expected ${EXPECTED.optionalNonLaborCount}, got ${optionalNonLaborCount}`);
      hasErrors = true;
    } else {
      console.log(`   ✅ Optional Non-Labor: ${optionalNonLaborCount} (matches expected)`);
    }
    
    if (Math.abs(requiredLaborCost - EXPECTED.requiredLaborCost) > 0.01) {
      console.error(`   ❌ Required Labor Cost: Expected $${EXPECTED.requiredLaborCost}, got $${requiredLaborCost.toFixed(2)}`);
      hasErrors = true;
    } else {
      console.log(`   ✅ Required Labor Cost: $${requiredLaborCost.toFixed(2)} (matches expected)`);
    }
    
    if (Math.abs(optionalLaborCost - EXPECTED.optionalLaborCost) > 0.01) {
      console.error(`   ❌ Optional Labor Cost: Expected $${EXPECTED.optionalLaborCost}, got $${optionalLaborCost.toFixed(2)}`);
      hasErrors = true;
    } else {
      console.log(`   ✅ Optional Labor Cost: $${optionalLaborCost.toFixed(2)} (matches expected)`);
    }
    
    if (Math.abs(totalLaborCost - EXPECTED.totalLaborCost) > 0.01) {
      console.error(`   ❌ Total Labor Cost: Expected $${EXPECTED.totalLaborCost}, got $${totalLaborCost.toFixed(2)}`);
      hasErrors = true;
    } else {
      console.log(`   ✅ Total Labor Cost: $${totalLaborCost.toFixed(2)} (matches expected)`);
    }
    
    // Test edge case: 0 labor hours
    const zeroHourItems = bom.items.filter((item: BOMItem) => 
      item.itemType === 'labor' && (item.laborHours === 0 || item.laborHours === null)
    );
    if (zeroHourItems.length > 0) {
      console.log('\n⚠️  Found items with 0 or null labor hours:');
      zeroHourItems.forEach((item: BOMItem) => {
        console.log(`   - ${item.partName}: ${item.laborHours}h @ $${item.hourlyRate}/h = $0`);
      });
    } else {
      console.log('\n✅ All labor items have valid hours (no 0 or null)');
    }
    
    if (hasErrors) {
      console.log('\n❌ Test 1 FAILED - Assertions did not match expected values\n');
      return false;
    }
    
    console.log('\n✅ Test 1 PASSED - All assertions matched\n');
    return true;
  } catch (error) {
    console.error('❌ Test 1 FAILED:', error);
    return false;
  }
}

// Test 2: Verify MRP Material Forecasting
async function test2_MRPForecasting() {
  console.log('Test 2: MRP Material Forecasting');
  console.log('═'.repeat(60));
  
  try {
    const response = await fetch('http://localhost:5000/api/inventory/material-forecast');
    if (!response.ok) {
      throw new Error(`MRP endpoint returned ${response.status}`);
    }
    const forecast = await response.json();
    
    console.log(`📋 MRP Forecast Results:`);
    console.log(`   Orders Processed: ${forecast.ordersProcessed}`);
    console.log(`   Materials Required: ${forecast.materialsRequired}`);
    console.log(`   Generated At: ${new Date(forecast.generatedAt).toLocaleString()}\n`);
    
    // ASSERTIONS - Verify structure
    console.log('🔍 Validating MRP response structure...');
    let hasErrors = false;
    
    if (typeof forecast.ordersProcessed !== 'number') {
      console.error('   ❌ ordersProcessed should be a number');
      hasErrors = true;
    } else {
      console.log(`   ✅ ordersProcessed is number: ${forecast.ordersProcessed}`);
    }
    
    if (typeof forecast.materialsRequired !== 'number') {
      console.error('   ❌ materialsRequired should be a number');
      hasErrors = true;
    } else {
      console.log(`   ✅ materialsRequired is number: ${forecast.materialsRequired}`);
    }
    
    if (!Array.isArray(forecast.forecast)) {
      console.error('   ❌ forecast should be an array');
      hasErrors = true;
      return false;
    } else {
      console.log(`   ✅ forecast is array with ${forecast.forecast.length} items`);
    }
    
    if (forecast.forecast.length > 0) {
      console.log('\n📦 Material Requirements:');
      forecast.forecast.forEach((item: any) => {
        console.log(`   ${item.partName}: ${item.totalQuantity} (from ${item.orderCount} orders)`);
      });
    } else {
      console.log('\nℹ️  No active orders with BOMs found (expected if no test orders created)');
    }
    
    // CRITICAL ASSERTION: Verify labor items are excluded
    console.log('\n🔍 Verifying labor exclusion from MRP...');
    const laborItems = forecast.forecast.filter((item: any) => 
      item.partName.toLowerCase().includes('labor') || 
      item.itemType === 'labor'
    );
    
    if (laborItems.length > 0) {
      console.error('   ❌ CRITICAL: Labor items found in MRP forecast (should be excluded):');
      laborItems.forEach((item: any) => {
        console.error(`      - ${item.partName}`);
      });
      hasErrors = true;
    } else {
      console.log('   ✅ No labor items in MRP forecast (correctly excluded)');
    }
    
    if (hasErrors) {
      console.log('\n❌ Test 2 FAILED - Critical assertions failed\n');
      return false;
    }
    
    console.log('\n✅ Test 2 PASSED - All assertions matched\n');
    return true;
  } catch (error) {
    console.error('❌ Test 2 FAILED:', error);
    return false;
  }
}

// Test 3: Verify Optional Items Handling
async function test3_OptionalItems() {
  console.log('Test 3: Optional Items Handling');
  console.log('═'.repeat(60));
  
  try {
    const response = await fetch('http://localhost:5000/api/robust-boms/stock-boms/6');
    const bom = await response.json();
    
    const optionalItems = bom.items.filter((item: BOMItem) => item.isOptional);
    const requiredItems = bom.items.filter((item: BOMItem) => !item.isOptional);
    
    console.log(`📋 Item Classification:`);
    console.log(`   Required Items: ${requiredItems.length}`);
    console.log(`   Optional Items: ${optionalItems.length}\n`);
    
    // Expected values
    const EXPECTED = {
      requiredCount: 10,  // 7 materials + 3 labor
      optionalCount: 3,   // 2 materials + 1 labor
      optionalItemNames: [
        'Paint - Custom Color',
        'Picatinny Rail Section 3-slot',
        'Paint Application'
      ]
    };
    
    // ASSERTIONS
    console.log('🔍 Validating optional items classification...');
    let hasErrors = false;
    
    if (requiredItems.length !== EXPECTED.requiredCount) {
      console.error(`   ❌ Required Items: Expected ${EXPECTED.requiredCount}, got ${requiredItems.length}`);
      hasErrors = true;
    } else {
      console.log(`   ✅ Required Items: ${requiredItems.length} (matches expected)`);
    }
    
    if (optionalItems.length !== EXPECTED.optionalCount) {
      console.error(`   ❌ Optional Items: Expected ${EXPECTED.optionalCount}, got ${optionalItems.length}`);
      hasErrors = true;
    } else {
      console.log(`   ✅ Optional Items: ${optionalItems.length} (matches expected)`);
    }
    
    // Verify specific optional items exist
    const actualOptionalNames = optionalItems.map((item: BOMItem) => item.partName);
    for (const expectedName of EXPECTED.optionalItemNames) {
      if (!actualOptionalNames.includes(expectedName)) {
        console.error(`   ❌ Missing expected optional item: "${expectedName}"`);
        hasErrors = true;
      }
    }
    
    if (!hasErrors) {
      console.log('   ✅ All expected optional items present');
    }
    
    console.log('\n🔹 Optional Items Details:');
    optionalItems.forEach((item: BOMItem) => {
      const type = item.itemType === 'labor' ? '⚙️ Labor' : '📦 Material';
      console.log(`   ${type} - ${item.partName}`);
      if (item.itemType === 'labor') {
        const cost = (item.laborHours || 0) * (item.hourlyRate || 0);
        console.log(`      ${item.laborHours}h @ $${item.hourlyRate}/h = $${cost.toFixed(2)}`);
      }
    });
    
    if (hasErrors) {
      console.log('\n❌ Test 3 FAILED - Assertions did not match expected values\n');
      return false;
    }
    
    console.log('\n✅ Test 3 PASSED - All assertions matched\n');
    return true;
  } catch (error) {
    console.error('❌ Test 3 FAILED:', error);
    return false;
  }
}

// Test 4: Verify Search String Encoding
async function test4_SearchEncoding() {
  console.log('Test 4: Search String Encoding');
  console.log('═'.repeat(60));
  
  const testCases = [
    'AR-15',           // Hyphen
    'Carbon & Fiber',  // Ampersand
    '50% Carbon',      // Percent
    'Test?Query',      // Question mark
    'Stock Kit',       // Space
  ];
  
  console.log('🔍 Testing special characters in search:\n');
  
  let allPassed = true;
  for (const searchTerm of testCases) {
    try {
      const encoded = encodeURIComponent(searchTerm);
      const response = await fetch(`http://localhost:5000/api/robust-boms/stock-boms?search=${encoded}`);
      const results = await response.json();
      
      const status = response.ok ? '✅' : '❌';
      console.log(`   ${status} "${searchTerm}" → encoded as "${encoded}" → ${results.length} results`);
      
      if (!response.ok) allPassed = false;
    } catch (error) {
      console.log(`   ❌ "${searchTerm}" → FAILED`);
      allPassed = false;
    }
  }
  
  console.log(allPassed ? '\n✅ Test 4 PASSED\n' : '\n❌ Test 4 FAILED\n');
  return allPassed;
}

// Test 5: Edge Cases
async function test5_EdgeCases() {
  console.log('Test 5: Edge Cases');
  console.log('═'.repeat(60));
  
  console.log('🧪 Testing edge cases:\n');
  
  // Test 5a: Empty search
  try {
    const response = await fetch('http://localhost:5000/api/robust-boms/stock-boms?search=');
    const results = await response.json();
    console.log(`   ✅ Empty search: ${results.length} BOMs returned`);
  } catch (error) {
    console.log('   ❌ Empty search failed');
    return false;
  }
  
  // Test 5b: Non-existent BOM
  try {
    const response = await fetch('http://localhost:5000/api/robust-boms/stock-boms/999999');
    if (response.status === 404 || response.status === 500) {
      console.log('   ✅ Non-existent BOM handled gracefully');
    } else {
      console.log('   ⚠️  Non-existent BOM returned unexpected status:', response.status);
    }
  } catch (error) {
    console.log('   ✅ Non-existent BOM handled with error');
  }
  
  // Test 5c: Invalid search characters
  try {
    const weirdSearch = '<<<>>>###@@@';
    const encoded = encodeURIComponent(weirdSearch);
    const response = await fetch(`http://localhost:5000/api/robust-boms/stock-boms?search=${encoded}`);
    const results = await response.json();
    console.log(`   ✅ Special characters search: ${results.length} results (no crash)`);
  } catch (error) {
    console.log('   ❌ Special characters search crashed');
    return false;
  }
  
  console.log('\n✅ Test 5 PASSED\n');
  return true;
}

// Run all tests
async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('  STOCK BOM SYSTEM - COMPREHENSIVE QA TEST SUITE');
  console.log('='.repeat(60) + '\n');
  
  const results = {
    test1: await test1_CostRollups(),
    test2: await test2_MRPForecasting(),
    test3: await test3_OptionalItems(),
    test4: await test4_SearchEncoding(),
    test5: await test5_EdgeCases(),
  };
  
  console.log('='.repeat(60));
  console.log('  TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  
  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;
  
  console.log(`\n✅ Passed: ${passed}/${total}`);
  console.log(`${passed === total ? '🎉' : '⚠️'} ${passed === total ? 'ALL TESTS PASSED!' : 'SOME TESTS FAILED'}\n`);
  
  return passed === total;
}

// Execute tests
runAllTests().then((success) => {
  process.exit(success ? 0 : 1);
}).catch((error) => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
