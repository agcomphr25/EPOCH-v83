#!/usr/bin/env node
/**
 * 🔒 Tripwire Script - Blocks PRs that modify protected files
 * 
 * This script prevents regressions by failing CI if critical files are modified.
 * To allow changes to a protected file, remove its pattern from the list below.
 */

const { execSync } = require('node:child_process');

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch (error) {
    console.error(`Command failed: ${cmd}`);
    console.error(error.message);
    process.exit(1);
  }
}

// Get base branch (works in both GitHub Actions and local)
const baseBranch = process.env.GITHUB_BASE_REF || 'main';

// Get changed files comparing to base branch
const changed = sh(`git diff --name-only origin/${baseBranch}...HEAD`)
  .split('\n')
  .filter(Boolean);

// 🔒 PROTECTED FILES - Add patterns here to prevent modifications
const protectedPatterns = [
  // Customer Management - Critical files
  /^server\/src\/routes\/customers\.ts$/,
  /^server\/src\/utils\/upsAddressValidation\.ts$/,
  
  // Add more protected patterns as needed:
  // /^client\/src\/pages\/OrdersManagementPage\.tsx$/,
  // /^client\/src\/pages\/OrdersList\.tsx$/,
  // /^client\/src\/pages\/RefundQueue\.tsx$/,
  // /^client\/src\/pages\/RefundRequest\.tsx$/,
  // /^server\/src\/routes\/salesOrderPdf\.ts$/,
  // /^server\/schema\.ts$/,  // Protect entire schema
  // /^shared\/schema\.ts$/,
];

// Find files that match protected patterns
const tripped = changed.filter(file => 
  protectedPatterns.some(pattern => pattern.test(file))
);

// Exit with error if protected files were modified
if (tripped.length > 0) {
  console.error('\n❌ TRIPWIRE ACTIVATED: Protected files were modified!\n');
  console.error('The following critical files cannot be changed:');
  tripped.forEach(file => console.error(`   🔒 ${file}`));
  console.error('\n📝 If this change is intentional:');
  console.error('   1. Edit scripts/tripwire-check.js');
  console.error('   2. Remove or adjust the pattern for the file you need to change');
  console.error('   3. Commit and push the updated tripwire script\n');
  process.exit(1);
}

// Success
console.log('✅ Tripwire check passed: No protected files modified');
console.log(`   Checked ${changed.length} changed file(s) against ${protectedPatterns.length} protection rule(s)`);
process.exit(0);
