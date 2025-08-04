# Feature Mapping Guide

This document provides guidelines for maintaining consistency between form controls and Order Summary displays in the OrderEntry component.

## Overview

The OrderEntry page has two types of feature storage:

1. **Features Object** (`features` state): Complex features with dynamic options from Feature Management
2. **Separate State Variables**: Simple features with hardcoded options

## Feature Storage Types

### Features Object (`features` state)
These features are stored in the `features` object and their options come from the Feature Management system:

```typescript
// ✅ CORRECT - These use features object
features.action_inlet      // Action Inlet
features.barrel_inlet      // Barrel Inlet  
features.qd_accessory      // QD Quick Detach Cups
features.length_of_pull    // LOP (Length of Pull)
features.texture_options   // Texture
features.swivel_studs      // Swivel Studs
```

### Separate State Variables
These features have their own state variables:

```typescript
// ✅ CORRECT - These use separate state variables
paintOptions               // Paint Options (state variable)
bottomMetal               // Bottom Metal (state variable)
railAccessory            // Rails (state variable, array)
otherOptions            // Other Options (state variable, array)
actionLength            // Action Length (state variable)
```

## Common Mistakes to Avoid

### ❌ WRONG: Inconsistent storage
```typescript
// Form uses features object
value={features.qd_accessory}
onValueChange={(value) => setFeatures(prev => ({ ...prev, qd_accessory: value }))}

// But Order Summary looks for separate state variable
{qdQuickDetach ? 'Selected' : 'Not selected'}  // ❌ WRONG!
```

### ✅ CORRECT: Consistent storage
```typescript
// Both form and Order Summary use features object
value={features.qd_accessory}
onValueChange={(value) => setFeatures(prev => ({ ...prev, qd_accessory: value }))}

// Order Summary also uses features object
{features.qd_accessory ? 'Selected' : 'Not selected'}  // ✅ CORRECT!
```

## Validation System

### Centralized Feature IDs
Use `FEATURE_IDS` constant from `utils/featureMapping.ts`:

```typescript
import { FEATURE_IDS } from '@/utils/featureMapping';

// ✅ CORRECT - Use centralized constants
const feature = featureDefs.find(f => f.id === FEATURE_IDS.QD_ACCESSORY);
```

### Development Validation
The system includes development-time validation hooks:

1. **`useFeatureValidation`**: Validates that all referenced feature IDs exist in database
2. **`useFeatureStateValidation`**: Checks for data storage inconsistencies

## Debugging Feature Issues

### Step 1: Check Feature IDs in Database
```bash
curl -s http://localhost:5000/api/features | grep -o '"id":"[^"]*"' | sort | uniq
```

### Step 2: Verify Storage Type
Check if the feature should be in `features` object or separate state variable using `FEATURE_STORAGE_MAP`.

### Step 3: Ensure Consistency
Both form control and Order Summary must use the same data source.

## Adding New Features

### For Features Object Storage:
1. Add form control using `features.{feature_id}`
2. Add Order Summary display using `features.{feature_id}`
3. Update `FEATURE_IDS` constant
4. Update `FEATURE_STORAGE_MAP`

### For Separate State Variable:
1. Create new state variable with `useState`
2. Add form control using the state variable
3. Add Order Summary display using the state variable
4. Update validation hook parameters

## Best Practices

1. **Always use centralized feature IDs** from `FEATURE_IDS` constant
2. **Use utility functions** like `getFeatureOptionDisplay()` for consistent display logic
3. **Test both form and Order Summary** when making changes
4. **Check browser console** for validation warnings during development
5. **Update this documentation** when adding new features

## Emergency Fix Checklist

When features show "Not selected" but have values:

1. ✅ Check if feature ID exists in database (use curl command above)
2. ✅ Verify form and Order Summary use same data source
3. ✅ Ensure feature ID constants are correct
4. ✅ Test that form submission includes the correct data
5. ✅ Check browser console for validation errors