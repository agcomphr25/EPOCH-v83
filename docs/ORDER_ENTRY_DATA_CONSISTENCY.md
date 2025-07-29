# Order Entry Data Consistency Guide

## The Problem We Keep Fixing

The Order Entry component has **two different data storage patterns** that cause recurring inconsistencies:

1. **Legacy Pattern**: Separate state variables (`bottomMetal`, `otherOptions`, `railAccessory`)
2. **Current Pattern**: Unified `features` object (`features.bottom_metal`, `features.other_options`, `features.rail_accessory`)

## Root Cause

Form controls store data in the `features` object, but some display/calculation logic reads from separate state variables, causing:
- Order Summary shows "Not selected" even when items are chosen
- Price calculations miss selected options
- Data doesn't persist correctly during save/load

## The Golden Rule

**ALWAYS use the `features` object for ALL feature-related data**

### ✅ CORRECT - Read from features object:
```javascript
// Order Summary display
{features.bottom_metal ? (() => {
  const feature = featureDefs.find(f => f.id === 'bottom_metal');
  const option = feature?.options?.find(opt => opt.value === features.bottom_metal);
  return option?.label || features.bottom_metal;
})() : 'Not selected'}

// Price calculation
if (features.bottom_metal) {
  const bottomMetalFeature = featureDefs.find(f => f.id === 'bottom_metal');
  if (bottomMetalFeature?.options) {
    const option = bottomMetalFeature.options.find(opt => opt.value === features.bottom_metal);
    if (option?.price) {
      total += option.price;
    }
  }
}

// Form controls
<Select 
  value={features.bottom_metal || ''} 
  onValueChange={(value) => setFeatures(prev => ({ ...prev, bottom_metal: value }))}
>
```

### ❌ WRONG - Don't use separate state variables:
```javascript
// Don't read from separate state
{bottomMetal ? (() => {
  // This will be empty even when features.bottom_metal has data
})() : 'Not selected'}

// Don't calculate prices from separate state
if (bottomMetal) {
  // This will miss pricing even when features.bottom_metal is selected
}
```

## Prevention Checklist

Before making any changes to OrderEntry.tsx:

1. **Search for separate state variables**: `bottomMetal`, `otherOptions`, `railAccessory`
2. **Verify all reads come from features object**: `features.bottom_metal`, `features.other_options`, `features.rail_accessory`
3. **Check price calculation dependencies**: Ensure `features` is in dependency array, not separate variables
4. **Test Order Summary display**: Select options and verify they appear correctly
5. **Test price calculation**: Verify prices update when options are selected

## Quick Fix Commands

If you find inconsistencies, search for these patterns and replace:

```bash
# Find Order Summary inconsistencies
grep -n "bottomMetal.*?" client/src/components/OrderEntry.tsx
grep -n "otherOptions.*?" client/src/components/OrderEntry.tsx

# Find price calculation inconsistencies  
grep -n "if (bottomMetal)" client/src/components/OrderEntry.tsx
grep -n "if (otherOptions" client/src/components/OrderEntry.tsx
```

## Architecture Decision

**Decision**: Use unified `features` object for all feature data
**Rationale**: Single source of truth prevents data consistency issues
**Date**: July 29, 2025
**Status**: Active - must be maintained in all future changes