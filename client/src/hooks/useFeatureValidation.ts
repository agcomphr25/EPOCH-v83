/**
 * Feature Validation Hook
 * 
 * Provides runtime validation and warnings for feature ID mismatches
 */

import { useEffect } from 'react';
// Define the Feature interface inline to avoid import issues
interface Feature {
  id: string;
  name: string;
  displayName: string;
  options?: { value: string; label: string; price?: number }[];
  category?: string;
}
import { validateAllFeatureReferences, FEATURE_IDS } from '../utils/featureMapping';

/**
 * Hook to validate feature references during development
 */
export function useFeatureValidation(features: Feature[]) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && features.length > 0) {
      // List all feature IDs used in the OrderEntry component
      const usedFeatureIds = [
        FEATURE_IDS.ACTION_INLET,
        FEATURE_IDS.BARREL_INLET,
        FEATURE_IDS.QD_ACCESSORY,
        FEATURE_IDS.LENGTH_OF_PULL,
        FEATURE_IDS.TEXTURE_OPTIONS,
        FEATURE_IDS.SWIVEL_STUDS,
        FEATURE_IDS.BOTTOM_METAL,
        FEATURE_IDS.RAIL_ACCESSORY,
        FEATURE_IDS.OTHER_OPTIONS,
        FEATURE_IDS.METALLIC_FINISHES,
        FEATURE_IDS.CAMO_PATTERNS,
        FEATURE_IDS.PROTECTIVE_COATINGS,
        FEATURE_IDS.CUSTOM_GRAPHICS,
        FEATURE_IDS.BASE_COLORS,
        FEATURE_IDS.SPECIAL_EFFECTS
      ];

      validateAllFeatureReferences(features, usedFeatureIds);
    }
  }, [features]);
}

/**
 * Hook to validate feature state consistency
 */
export function useFeatureStateValidation(
  features: any, // features object
  separateStateVars: { [key: string]: any }
) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // Check for potential data inconsistencies
      const warnings: string[] = [];

      // Check if any feature is stored in both places
      Object.keys(features).forEach(key => {
        if (separateStateVars[key] !== undefined) {
          warnings.push(`Feature '${key}' exists in both features object and separate state`);
        }
      });

      if (warnings.length > 0) {
        console.warn('⚠️  Feature state inconsistencies detected:', warnings);
      }
    }
  }, [features, separateStateVars]);
}