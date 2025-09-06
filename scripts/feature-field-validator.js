#!/usr/bin/env node

/**
 * Feature Field Validation Script
 * 
 * This script enforces consistent usage of the features object as the single source of truth
 * for all feature-related data, supporting the "Golden Rule" of the EPOCH v8 system.
 * 
 * It identifies violations where direct field names are used instead of features.fieldName
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Comprehensive list of all feature fields that should use features.fieldName
const FEATURES_OBJECT_FIELDS = [
  // Core features stored in features object
  'action_inlet',
  'barrel_inlet', 
  'qd_accessory',
  'length_of_pull',
  'texture_options',
  'swivel_studs',
  'action_length',
  'barrel_length',
  'heavy_fill',
  'other_options',
  
  // Paint-related features
  'metallic_finishes',
  'camo_patterns', 
  'protective_coatings',
  'custom_graphics',
  'base_colors',
  'special_effects',
  'paint_options',
  'paint_options_combined',
  
  // Additional features from codebase scan
  'bottom_metal',
  'rail_accessory',
  'stock_model',
  'model_id'
];

// State variables that are legitimately separate (not in features object)
const LEGITIMATE_STATE_VARS = [
  'paintOptions',    // Paint options state variable
  'bottomMetal',     // Bottom metal state variable  
  'railAccessory',   // Rail accessory state variable
  'otherOptions',    // Other options state variable
  'actionLength',    // Action length state variable
  'stockModel',      // Stock model state variable
  'modelId'          // Model ID state variable
];

// Files to scan for violations
const SCAN_DIRECTORIES = [
  'client/src/components',
  'client/src/pages', 
  'client/src/hooks',
  'client/src/utils',
  'shared'
];

// Patterns that should be ignored (legitimate uses)
const IGNORE_PATTERNS = [
  /const \[.*\]/,           // React useState declarations
  /set[A-Z].*/,             // setState functions
  /interface.*{/,           // Interface definitions
  /type.*=/,                // Type definitions
  /\/\//,                   // Comments
  /\/\*/,                   // Block comments
  /'[^']*'|"[^"]*"/,        // String literals
  /import.*from/,           // Import statements
  /export.*{/,              // Export statements
  /\.includes\(/,           // String includes calls
  /\[.*\]/,                 // Array access
  /console\./,              // Console statements
];

class FeatureFieldValidator {
  constructor() {
    this.violations = [];
    this.stats = {
      filesScanned: 0,
      violationsFound: 0
    };
  }

  /**
   * Main validation function
   */
  validate() {
    console.log('🔍 Feature Field Validation Starting...\n');
    console.log(`📋 Checking ${FEATURES_OBJECT_FIELDS.length} feature fields for consistent usage\n`);

    for (const dir of SCAN_DIRECTORIES) {
      if (fs.existsSync(dir)) {
        this.scanDirectory(dir);
      } else {
        console.log(`⚠️  Directory ${dir} does not exist, skipping...`);
      }
    }

    this.generateReport();
  }

  /**
   * Recursively scan directory for violations
   */
  scanDirectory(dirPath) {
    const entries = fs.readdirSync(dirPath);

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip node_modules and other irrelevant directories
        if (!['node_modules', '.git', 'dist', 'build'].includes(entry)) {
          this.scanDirectory(fullPath);
        }
      } else if (this.isRelevantFile(entry)) {
        this.scanFile(fullPath);
      }
    }
  }

  /**
   * Check if file should be scanned
   */
  isRelevantFile(filename) {
    return /\.(ts|tsx|js|jsx)$/.test(filename) && 
           !filename.includes('.test.') && 
           !filename.includes('.spec.');
  }

  /**
   * Scan individual file for violations
   */
  scanFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      this.stats.filesScanned++;

      lines.forEach((line, index) => {
        const lineNum = index + 1;
        this.checkLine(line, lineNum, filePath);
      });

    } catch (error) {
      console.log(`⚠️  Error reading file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Check individual line for violations
   */
  checkLine(line, lineNum, filePath) {
    // Skip lines that match ignore patterns
    if (IGNORE_PATTERNS.some(pattern => pattern.test(line))) {
      return;
    }

    // Check each feature field for improper usage
    FEATURES_OBJECT_FIELDS.forEach(field => {
      // Convert snake_case to camelCase for state variable detection
      const camelCaseField = this.snakeToCamel(field);
      
      // Look for direct field usage (not prefixed with features.)
      const directUsageRegex = new RegExp(`\\b${field}\\b`);
      const camelUsageRegex = new RegExp(`\\b${camelCaseField}\\b`);
      
      const hasDirectUsage = directUsageRegex.test(line);
      const hasCamelUsage = camelUsageRegex.test(line);
      const hasFeaturesPrefix = line.includes(`features.${field}`);
      
      // Check for violations - using field name without features. prefix
      if ((hasDirectUsage || hasCamelUsage) && !hasFeaturesPrefix) {
        // Allow legitimate state variables
        if (LEGITIMATE_STATE_VARS.includes(camelCaseField)) {
          return;
        }

        // Additional context checks
        if (this.isViolation(line, field, camelCaseField)) {
          this.violations.push({
            file: filePath,
            line: lineNum,
            field: field,
            actualUsage: line.trim(),
            expectedUsage: `features.${field}`,
            severity: this.getSeverity(line, field)
          });
          this.stats.violationsFound++;
        }
      }
    });
  }

  /**
   * Determine if usage is actually a violation
   */
  isViolation(line, field, camelCaseField) {
    // Skip if it's in a comment
    if (line.trim().startsWith('//') || line.includes('/*') || line.includes('*/')) {
      return false;
    }

    // Skip if it's in a string literal
    if (line.includes(`'${field}'`) || line.includes(`"${field}"`)) {
      return false;
    }

    // Skip if it's a property definition
    if (line.includes(`${field}:`) || line.includes(`${camelCaseField}:`)) {
      return false;
    }

    // Skip if it's already correctly using features.
    if (line.includes(`features.${field}`)) {
      return false;
    }

    return true;
  }

  /**
   * Convert snake_case to camelCase
   */
  snakeToCamel(str) {
    return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
  }

  /**
   * Determine violation severity
   */
  getSeverity(line, field) {
    // High severity for direct state access that should use features
    if (line.includes('useState') || line.includes('setState')) {
      return 'HIGH';
    }
    
    // Medium severity for component props/rendering
    if (line.includes('value=') || line.includes('defaultValue=')) {
      return 'MEDIUM';
    }
    
    return 'LOW';
  }

  /**
   * Generate and display validation report
   */
  generateReport() {
    console.log('\n📊 Feature Field Validation Report');
    console.log('=====================================');
    console.log(`Files scanned: ${this.stats.filesScanned}`);
    console.log(`Violations found: ${this.stats.violationsFound}\n`);

    if (this.violations.length === 0) {
      console.log('✅ No feature field violations found! Great job maintaining consistency.\n');
      return;
    }

    // Group violations by file
    const violationsByFile = this.violations.reduce((acc, violation) => {
      if (!acc[violation.file]) {
        acc[violation.file] = [];
      }
      acc[violation.file].push(violation);
      return acc;
    }, {});

    // Display violations by file
    Object.keys(violationsByFile).forEach(file => {
      console.log(`\n📄 ${file}`);
      console.log('─'.repeat(file.length + 3));
      
      violationsByFile[file].forEach(violation => {
        const severityIcon = violation.severity === 'HIGH' ? '🔴' : 
                            violation.severity === 'MEDIUM' ? '🟡' : '🟢';
        
        console.log(`  ${severityIcon} Line ${violation.line}: Using '${violation.field}' instead of '${violation.expectedUsage}'`);
        console.log(`     Code: ${violation.actualUsage}`);
        console.log('');
      });
    });

    console.log('\n💡 How to fix these violations:');
    console.log('  1. Replace direct field usage with features.fieldName');
    console.log('  2. Ensure the features object is the single source of truth');
    console.log('  3. Update any state management to sync with features object\n');

    // Exit with error code if violations found
    process.exit(this.violations.length > 0 ? 1 : 0);
  }
}

// Run the validator if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new FeatureFieldValidator();
  validator.validate();
}

export default FeatureFieldValidator;