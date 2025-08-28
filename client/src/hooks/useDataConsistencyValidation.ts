import { useEffect } from 'react';

/**
 * Development-only hook to validate data consistency in OrderEntry component
 * Catches the recurring issue where separate state variables are out of sync with features object
 */
export function useDataConsistencyValidation(
  features: Record<string, any>,
  separateStateVars: {
    bottomMetal?: string;
    otherOptions?: string[];
    railAccessory?: string[];
    paintOptions?: string;
  }
) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const inconsistencies: string[] = [];

    // Check Bottom Metal consistency
    if (features.bottom_metal !== separateStateVars.bottomMetal) {
      if (features.bottom_metal && !separateStateVars.bottomMetal) {
        inconsistencies.push(`❌ Bottom Metal: features.bottom_metal="${features.bottom_metal}" but bottomMetal state is empty`);
      } else if (!features.bottom_metal && separateStateVars.bottomMetal) {
        inconsistencies.push(`❌ Bottom Metal: bottomMetal state="${separateStateVars.bottomMetal}" but features.bottom_metal is empty`);
      } else if (features.bottom_metal && separateStateVars.bottomMetal) {
        inconsistencies.push(`❌ Bottom Metal: Mismatch - features.bottom_metal="${features.bottom_metal}" vs bottomMetal="${separateStateVars.bottomMetal}"`);
      }
    }

    // Check Other Options consistency
    const featuresOther = features.other_options || [];
    const stateOther = separateStateVars.otherOptions || [];
    
    if (JSON.stringify(featuresOther.sort()) !== JSON.stringify(stateOther.sort())) {
      inconsistencies.push(`❌ Other Options: Mismatch - features.other_options=[${featuresOther.join(',')}] vs otherOptions=[${stateOther.join(',')}]`);
    }

    // Check Rail Accessory consistency
    const featuresRail = features.rail_accessory || [];
    const stateRail = separateStateVars.railAccessory || [];
    
    if (JSON.stringify(featuresRail.sort()) !== JSON.stringify(stateRail.sort())) {
      inconsistencies.push(`❌ Rail Accessory: Mismatch - features.rail_accessory=[${featuresRail.join(',')}] vs railAccessory=[${stateRail.join(',')}]`);
    }

    // Check Paint Options consistency
    const featuresPaint = features.paint_options || features.metallic_finishes || features.paint_options_combined;
    if (featuresPaint !== separateStateVars.paintOptions) {
      if (featuresPaint && !separateStateVars.paintOptions) {
        inconsistencies.push(`❌ Paint Options: features has paint="${featuresPaint}" but paintOptions state is empty`);
      } else if (!featuresPaint && separateStateVars.paintOptions) {
        inconsistencies.push(`❌ Paint Options: paintOptions state="${separateStateVars.paintOptions}" but features has no paint value`);
      } else if (featuresPaint && separateStateVars.paintOptions) {
        inconsistencies.push(`❌ Paint Options: Mismatch - features paint="${featuresPaint}" vs paintOptions="${separateStateVars.paintOptions}"`);
      }
    }

    if (inconsistencies.length > 0) {
      console.group('🚨 ORDER ENTRY DATA CONSISTENCY VIOLATIONS');
      console.error('The following data inconsistencies were detected:');
      inconsistencies.forEach(issue => console.error(issue));
      console.error('\n💡 Fix: Update Order Summary and price calculations to read from features object instead of separate state variables');
      console.error('📖 See: docs/ORDER_ENTRY_DATA_CONSISTENCY.md for complete guidance');
      console.groupEnd();
      
      // In development, also show a visual warning
      if (typeof window !== 'undefined') {
        const warningDiv = document.getElementById('data-consistency-warning');
        if (!warningDiv) {
          const warning = document.createElement('div');
          warning.id = 'data-consistency-warning';
          warning.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #ff4444;
            color: white;
            padding: 10px;
            border-radius: 5px;
            z-index: 10000;
            max-width: 300px;
            font-size: 12px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
          `;
          warning.innerHTML = `
            <strong>⚠️ Data Consistency Issue</strong><br>
            ${inconsistencies.length} violation(s) detected.<br>
            Check console for details.
          `;
          document.body.appendChild(warning);
          
          // Auto-remove after 10 seconds
          setTimeout(() => warning.remove(), 10000);
        }
      }
    }
  }, [features, separateStateVars.bottomMetal, separateStateVars.otherOptions, separateStateVars.railAccessory, separateStateVars.paintOptions]);
}