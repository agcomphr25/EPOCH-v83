# Feature Field Validation System

This document outlines the comprehensive validation system for enforcing consistent usage of the `features` object as the single source of truth for all feature-related data in the EPOCH v8 system.

## Overview

The Feature Field Validation System supports the "Golden Rule" established in the EPOCH v8 architecture: **the `features` object must be the single source of truth for all feature-related data**.

## Validation Components

### 1. Feature Field Validator Script (`scripts/feature-field-validator.js`)

A comprehensive validation script that scans your codebase for violations of feature field consistency.

**Usage:**

```bash
# Run the validator
node scripts/feature-field-validator.js

# Run with npm script (once added to package.json)
npm run validate:features
```

**What it checks:**

- Direct usage of feature field names without `features.` prefix
- Inconsistent access patterns across components
- Violations of the features object golden rule

### 2. ESLint Rule (`eslint-rules/feature-consistency.js`)

A custom ESLint rule that integrates feature validation into your development workflow.

**Features:**

- Real-time validation during development
- Auto-fix capability for simple violations
- Integration with existing ESLint configuration

## Comprehensive Feature Field List

Based on the codebase scan, the following fields should always use the `features.` prefix:

### Core Features (stored in features object)

- `action_inlet` → `features.action_inlet`
- `barrel_inlet` → `features.barrel_inlet`
- `qd_accessory` → `features.qd_accessory`
- `length_of_pull` → `features.length_of_pull`
- `texture_options` → `features.texture_options`
- `swivel_studs` → `features.swivel_studs`
- `action_length` → `features.action_length`
- `barrel_length` → `features.barrel_length`
- `heavy_fill` → `features.heavy_fill`
- `other_options` → `features.other_options`

### Paint-Related Features

- `metallic_finishes` → `features.metallic_finishes`
- `camo_patterns` → `features.camo_patterns`
- `protective_coatings` → `features.protective_coatings`
- `custom_graphics` → `features.custom_graphics`
- `base_colors` → `features.base_colors`
- `special_effects` → `features.special_effects`
- `paint_options` → `features.paint_options`
- `paint_options_combined` → `features.paint_options_combined`

### Additional Features

- `bottom_metal` → `features.bottom_metal`
- `rail_accessory` → `features.rail_accessory`

## Legitimate State Variables

These variables are allowed as separate state variables and do NOT require the `features.` prefix:

- `paintOptions` (Paint options state variable)
- `bottomMetal` (Bottom metal state variable)
- `railAccessory` (Rail accessory state variable)
- `otherOptions` (Other options state variable)
- `actionLength` (Action length state variable)
- `stockModel` (Stock model state variable)
- `modelId` (Model ID state variable)

## Running the Validation

### Manual Validation

```bash
# Navigate to project root and run
node scripts/feature-field-validator.js
```

### Sample Output

```
🔍 Feature Field Validation Starting...

📋 Checking 21 feature fields for consistent usage

📊 Feature Field Validation Report
=====================================
Files scanned: 45
Violations found: 8

📄 client/src/components/OrderEntry.tsx
───────────────────────────────────────────
  🔴 Line 245: Using 'action_length' instead of 'features.action_length'
     Code: const actionLength = order.action_length;

  🟡 Line 312: Using 'bottom_metal' instead of 'features.bottom_metal'
     Code: value={bottom_metal}

💡 How to fix these violations:
  1. Replace direct field usage with features.fieldName
  2. Ensure the features object is the single source of truth
  3. Update any state management to sync with features object
```

## Integration with Development Workflow

### Pre-commit Validation

Add to your git hooks or CI/CD pipeline:

```bash
# Run feature validation before commits
node scripts/feature-field-validator.js
```

### IDE Integration

The ESLint rule provides real-time feedback in IDEs that support ESLint integration.

## Best Practices

### ✅ Correct Usage

```typescript
// Use features object for all feature-related data
const actionInlet = features.action_inlet;
const lopValue = features.length_of_pull;
const paintOption = features.metallic_finishes;

// Update features object consistently
setFeatures((prev) => ({
  ...prev,
  action_inlet: newValue,
}));
```

### ❌ Incorrect Usage

```typescript
// Don't access feature fields directly
const actionInlet = action_inlet; // WRONG!
const lopValue = length_of_pull; // WRONG!

// Don't mix access patterns
const inlet = features.action_inlet; // Correct
const lop = length_of_pull; // WRONG!
```

## Enforcement Levels

### 🔴 High Severity

- Direct state variable usage that bypasses features object
- Inconsistent data flow patterns

### 🟡 Medium Severity

- Component props/rendering inconsistencies
- Form value bindings

### 🟢 Low Severity

- Display/formatting inconsistencies
- Non-critical access patterns

## Maintenance

### Adding New Feature Fields

1. Add the field name to `FEATURES_OBJECT_FIELDS` in both validator scripts
2. Update this documentation
3. Run validation to catch existing violations
4. Update components to use consistent access patterns

### Updating Legitimate State Variables

1. Add to `LEGITIMATE_STATE_VARS` in validator scripts
2. Document the reasoning for separate state management
3. Ensure data consistency hooks handle synchronization

## Troubleshooting

### Common Issues

**False Positives:**

- Check if the field should be added to `LEGITIMATE_STATE_VARS`
- Verify ignore patterns are working correctly
- Review context-specific validation logic

**Missing Violations:**

- Ensure field is in `FEATURES_OBJECT_FIELDS` list
- Check for naming variations (snake_case vs camelCase)
- Verify file is being scanned (check scan directories)

**Performance:**

- Large codebases may take time to scan
- Consider filtering scan directories for focused validation
- Use ESLint rule for real-time feedback during development

This validation system ensures the EPOCH v8 "Golden Rule" is consistently enforced, maintaining data integrity and preventing the kind of inconsistencies that could break the order management workflow.
