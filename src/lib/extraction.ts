import type { Annotation, TemplateField } from "../types";

export interface ExtractionSuggestion {
  field_id: string;
  field_name: string;
  value: string;
  annotation_ids: string[];
}

export function suggestFields(
  annotations: Annotation[],
  fields: TemplateField[]
): ExtractionSuggestion[] {
  if (!annotations || annotations.length === 0 || !fields || fields.length === 0) {
    return [];
  }

  const suggestions: ExtractionSuggestion[] = [];

  for (const field of fields) {
    const fLower = field.name.toLowerCase();
    const keywords = fLower.split(/\s+/).filter((w: string) => w.length > 3);

    let matchedAnn = annotations.find((ann: Annotation) => {
      const qLower = ann.quote.toLowerCase();
      const nLower = (ann.note || "").toLowerCase();
      return keywords.some((k: string) => qLower.includes(k) || nLower.includes(k));
    });

    if (!matchedAnn && annotations.length > 0) {
      const idx = Math.abs(field.position) % annotations.length;
      matchedAnn = annotations[idx];
    }

    if (matchedAnn && matchedAnn.id && matchedAnn.quote.trim().length > 0) {
      suggestions.push({
        field_id: field.id,
        field_name: field.name,
        value: matchedAnn.quote.trim(),
        annotation_ids: [matchedAnn.id],
      });
    }
  }

  return suggestions;
}
