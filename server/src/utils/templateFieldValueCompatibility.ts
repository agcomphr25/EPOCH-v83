const hasSubmittedValue = (value: unknown) =>
  value != null && value !== '' && (!Array.isArray(value) || value.length > 0);

const normalizeFieldKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

export const normalizeTemplateFieldValues = (fieldValues: unknown) => {
  const values = fieldValues && typeof fieldValues === 'object'
    ? { ...(fieldValues as Record<string, unknown>) }
    : {};

  // Work Instructions templates have used partList, partsList, parts_list,
  // and display-label keys over time. Resolve any populated Part List variant
  // to both names still consumed by validation and legacy PDF rendering.
  const submittedPartListKey = Object.keys(values).find((key) => {
    const normalizedKey = normalizeFieldKey(key);
    return (
      (normalizedKey === 'partlist' || normalizedKey === 'partslist') &&
      hasSubmittedValue(values[key])
    );
  });
  const submittedPartList = submittedPartListKey ? values[submittedPartListKey] : undefined;

  if (!hasSubmittedValue(values.partList) && hasSubmittedValue(submittedPartList)) {
    values.partList = submittedPartList;
  }
  if (!hasSubmittedValue(values.partsList) && hasSubmittedValue(submittedPartList)) {
    values.partsList = submittedPartList;
  }

  return values;
};
