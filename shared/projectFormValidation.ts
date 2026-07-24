import type { DesignControlFormDefinition } from './designControlFormCatalog';

export type ProjectFormContent = {
  fields?: Record<string, unknown>;
  sections?: Record<string, unknown>;
  repeatingRows?: Record<string, Array<Record<string, unknown>>>;
  requirementReferences?: unknown[];
  evidenceReferences?: unknown[];
  comments?: string;
};

const present = (value: unknown) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

export function canonicalizeProjectFormContent(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeProjectFormContent).join(',')}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalizeProjectFormContent(object[key])}`
    )
    .join(',')}}`;
}

export function validateProjectFormContent(
  definition: DesignControlFormDefinition,
  content: ProjectFormContent
) {
  const fields = content.fields ?? {};
  const sections = content.sections ?? {};
  const repeatingRows = content.repeatingRows ?? {};
  const missing: string[] = [];

  for (const section of definition.sections) {
    if (section.key === 'approvals') continue;
    if (section.repeating) {
      const rows = repeatingRows[section.key] ?? [];
      if (section.fields.some((field) => field.required) && rows.length === 0) {
        missing.push(`${section.key}.__row__`);
      }
      rows.forEach((row, rowIndex) => {
        for (const field of section.fields.filter((item) => item.required)) {
          if (!present(row[field.key])) {
            missing.push(`${section.key}.${rowIndex}.${field.key}`);
          }
        }
      });
      continue;
    }
    const values =
      typeof sections[section.key] === 'object' &&
      sections[section.key] !== null &&
      !Array.isArray(sections[section.key])
        ? (sections[section.key] as Record<string, unknown>)
        : fields;
    for (const field of section.fields.filter((item) => item.required)) {
      if (!present(values[field.key] ?? fields[field.key])) {
        missing.push(`${section.key}.${field.key}`);
      }
    }
  }

  return { valid: missing.length === 0, missing };
}
