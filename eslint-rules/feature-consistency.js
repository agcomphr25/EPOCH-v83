/**
 * ESLint Rule: feature-consistency
 * 
 * Enforces consistent usage of features object fields to maintain the "Golden Rule"
 * that features object is the single source of truth for all feature-related data.
 */

const FEATURES_OBJECT_FIELDS = [
  'action_inlet', 'barrel_inlet', 'qd_accessory', 'length_of_pull', 
  'texture_options', 'swivel_studs', 'action_length', 'barrel_length',
  'heavy_fill', 'other_options', 'metallic_finishes', 'camo_patterns',
  'protective_coatings', 'custom_graphics', 'base_colors', 'special_effects',
  'paint_options', 'paint_options_combined', 'bottom_metal', 'rail_accessory'
];

const LEGITIMATE_STATE_VARS = [
  'paintOptions', 'bottomMetal', 'railAccessory', 'otherOptions', 
  'actionLength', 'stockModel', 'modelId'
];

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'enforce consistent usage of features object fields',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: 'code',
    schema: [],
    messages: {
      useFeatureObject: 'Use "features.{{field}}" instead of "{{field}}" for consistent data access',
      avoidDirectAccess: 'Direct field access "{{field}}" should use features object: "features.{{field}}"',
    }
  },

  create(context) {
    return {
      Identifier(node) {
        const fieldName = node.name;
        
        // Skip if not a feature field
        if (!FEATURES_OBJECT_FIELDS.includes(fieldName)) {
          return;
        }

        // Skip legitimate state variables
        const camelCase = fieldName.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        if (LEGITIMATE_STATE_VARS.includes(camelCase)) {
          return;
        }

        // Skip if already accessing via features object
        const parent = node.parent;
        if (parent && parent.type === 'MemberExpression' && 
            parent.object && parent.object.name === 'features') {
          return;
        }

        // Skip property definitions and string literals
        if (parent && (
          parent.type === 'Property' && parent.key === node ||
          parent.type === 'Literal' ||
          parent.type === 'ImportSpecifier' ||
          parent.type === 'VariableDeclarator' && parent.id === node
        )) {
          return;
        }

        // Report violation
        context.report({
          node,
          messageId: 'useFeatureObject',
          data: {
            field: fieldName
          },
          fix(fixer) {
            return fixer.replaceText(node, `features.${fieldName}`);
          }
        });
      }
    };
  }
};