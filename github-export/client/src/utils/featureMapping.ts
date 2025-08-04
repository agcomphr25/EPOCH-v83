/**
 * Feature Mapping Utilities
 * 
 * This file provides centralized feature ID mapping and validation
 * to prevent mismatches between form controls and Order Summary displays.
 */

// Define the Feature interface inline to avoid import issues
interface Feature {
  id: string;
  name: string;
  displayName: string;
  options?: { value: string; label: string; price?: number }[];
  category?: string;
}

// Centralized feature ID mappings
export const FEATURE_IDS = {
  // Features stored in `features` object
  ACTION_INLET: 'action_inlet',
  BARREL_INLET: 'barrel_inlet',
  QD_ACCESSORY: 'qd_accessory',
  LENGTH_OF_PULL: 'length_of_pull',
  TEXTURE_OPTIONS: 'texture_options',
  SWIVEL_STUDS: 'swivel_studs',
  
  // Features stored as separate state variables
  BOTTOM_METAL: 'bottom_metal',
  RAIL_ACCESSORY: 'rail_accessory',
  OTHER_OPTIONS: 'other_options',
  
  // Paint-related features
  METALLIC_FINISHES: 'metallic_finishes',
  CAMO_PATTERNS: 'camo_patterns',
  PROTECTIVE_COATINGS: 'protective_coatings',
  CUSTOM_GRAPHICS: 'custom_graphics',
  BASE_COLORS: 'base_colors',
  SPECIAL_EFFECTS: 'special_effects'
} as const;

// Type for feature storage location
export type FeatureStorageType = 'features_object' | 'state_variable';

// Define where each feature should be stored
export const FEATURE_STORAGE_MAP: Record<string, FeatureStorageType> = {
  [FEATURE_IDS.ACTION_INLET]: 'features_object',
  [FEATURE_IDS.BARREL_INLET]: 'features_object',
  [FEATURE_IDS.QD_ACCESSORY]: 'features_object',
  [FEATURE_IDS.LENGTH_OF_PULL]: 'features_object',
  [FEATURE_IDS.TEXTURE_OPTIONS]: 'features_object',
  [FEATURE_IDS.SWIVEL_STUDS]: 'features_object',
  
  // These are separate state variables (not in features object)
  [FEATURE_IDS.BOTTOM_METAL]: 'state_variable',
  [FEATURE_IDS.RAIL_ACCESSORY]: 'state_variable',
  [FEATURE_IDS.OTHER_OPTIONS]: 'state_variable',
  
  // Paint options are separate state variable
  'paint_options': 'state_variable'
};

/**
 * Find a feature by ID with fallback to name
 */
export function findFeature(features: Feature[], featureId: string): Feature | undefined {
  return features.find(f => f.id === featureId || f.name === featureId);
}

/**
 * Find feature option by value
 */
export function findFeatureOption(feature: Feature | undefined, value: string) {
  if (!feature?.options) return null;
  return feature.options.find(opt => opt.value === value);
}

/**
 * Get display name for feature option with fallbacks
 */
export function getFeatureOptionDisplay(
  features: Feature[], 
  featureId: string, 
  value: string
): { label: string; price: number } {
  const feature = findFeature(features, featureId);
  const option = findFeatureOption(feature, value);
  
  return {
    label: option?.label || value || 'Not selected',
    price: option?.price || 0
  };
}

/**
 * Validate feature ID exists in database
 */
export function validateFeatureId(features: Feature[], featureId: string): boolean {
  return features.some(f => f.id === featureId || f.name === featureId);
}

/**
 * Get all paint-related features
 */
export function getPaintFeatures(features: Feature[]): Feature[] {
  return features.filter(f => 
    f.category === 'paint_options' ||
    f.displayName?.includes('Options') ||
    f.displayName?.includes('Camo') ||
    f.displayName?.includes('Cerakote') ||
    f.displayName?.includes('Terrain') ||
    f.displayName?.includes('Rogue') ||
    f.displayName?.includes('Standard') ||
    Object.values(FEATURE_IDS).slice(-6).includes(f.id as any) // Paint-related IDs
  );
}

/**
 * Development helper: Log feature validation errors
 */
export function validateAllFeatureReferences(
  features: Feature[], 
  usedFeatureIds: string[]
): void {
  if (process.env.NODE_ENV === 'development') {
    const missingFeatures = usedFeatureIds.filter(id => !validateFeatureId(features, id));
    
    if (missingFeatures.length > 0) {
      console.warn('⚠️  Missing feature IDs detected:', missingFeatures);
      console.log('Available feature IDs:', features.map(f => f.id));
    }
  }
}