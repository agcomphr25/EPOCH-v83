const hasSubmittedValue = (value: unknown) =>
  value != null && value !== '' && (!Array.isArray(value) || value.length > 0);

const normalizeFieldKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

type TemplateFieldIdentity = {
  fieldName?: unknown;
  field_name?: unknown;
  fieldLabel?: unknown;
  field_label?: unknown;
};

const isPartListIdentity = (value: unknown) => {
  if (typeof value !== 'string') return false;
  const normalizedValue = normalizeFieldKey(value);
  return normalizedValue === 'partlist' || normalizedValue === 'partslist';
};

export const normalizeTemplateFieldValues = (
  fieldValues: unknown,
  fieldDefinitions: TemplateFieldIdentity[] = [],
) => {
  const values = fieldValues && typeof fieldValues === 'object'
    ? { ...(fieldValues as Record<string, unknown>) }
    : {};

  // Browser template metadata and database template metadata can retain
  // different field names after a template revision even though the visible
  // label is unchanged. Reconcile those names before required-field
  // validation so a value entered under either definition reaches every
  // field with that same label.
  const fieldNamesByLabel = new Map<string, Set<string>>();
  for (const field of fieldDefinitions) {
    const fieldName = field.fieldName ?? field.field_name;
    const fieldLabel = field.fieldLabel ?? field.field_label;
    if (typeof fieldName !== 'string' || typeof fieldLabel !== 'string') continue;

    const normalizedLabel = normalizeFieldKey(fieldLabel);
    if (!normalizedLabel) continue;

    const fieldNames = fieldNamesByLabel.get(normalizedLabel) ?? new Set<string>();
    fieldNames.add(fieldName);
    fieldNamesByLabel.set(normalizedLabel, fieldNames);
  }

  for (const [normalizedLabel, fieldNames] of fieldNamesByLabel) {
    for (const key of Object.keys(values)) {
      if (normalizeFieldKey(key) === normalizedLabel) fieldNames.add(key);
    }

    const submittedKey = Array.from(fieldNames).find((key) => hasSubmittedValue(values[key]));
    if (!submittedKey) continue;

    for (const fieldName of fieldNames) {
      if (!hasSubmittedValue(values[fieldName])) values[fieldName] = values[submittedKey];
    }
  }

  // Work Instructions templates have used partList, partsList, parts_list,
  // and display-label keys over time. Resolve any populated Part List variant
  // to both names still consumed by validation and legacy PDF rendering.
  const partListKeys = new Set(['partList', 'partsList']);
  for (const key of Object.keys(values)) {
    if (isPartListIdentity(key)) {
      partListKeys.add(key);
    }
  }
  for (const field of fieldDefinitions) {
    const fieldName = field.fieldName ?? field.field_name;
    const fieldLabel = field.fieldLabel ?? field.field_label;
    if (
      typeof fieldName === 'string' &&
      (isPartListIdentity(fieldName) || isPartListIdentity(fieldLabel))
    ) {
      partListKeys.add(fieldName);
    }
  }

  const submittedPartListKey = Array.from(partListKeys).find((key) =>
    hasSubmittedValue(values[key]),
  );
  const submittedPartList = submittedPartListKey ? values[submittedPartListKey] : undefined;

  if (hasSubmittedValue(submittedPartList)) {
    for (const key of partListKeys) {
      if (!hasSubmittedValue(values[key])) {
        values[key] = submittedPartList;
      }
    }
  }

  return values;
};
