// =============================================================================
// Recommendation Blocks — Rule-Based Mapping (Issue #45)
// =============================================================================
// Maps analysis recommendations (free-form German/English strings from the
// Rust analysis engine) to editable markdown text blocks that can be inserted
// into a prompt draft. Deterministic, local-only, no network.
// =============================================================================

/** One editable text block derived from a single recommendation. */
export interface RecommendationBlock {
  /** Stable id: `rec-block-<index>`. */
  id: string;
  /** The original recommendation string (never modified). */
  sourceRecommendation: string;
  /** Markdown section heading for the block (e.g. `## Ziel`). */
  heading: string;
  /** Editable markdown text (initialised with a template). */
  text: string;
}

interface HeadingRule {
  /** Case-insensitive keywords — first matching rule wins. */
  keywords: RegExp;
  heading: string;
  template: string;
}

const DE = (s: string) => s;

const RULES: HeadingRule[] = [
  {
    keywords: /secret/i,
    heading: "## Sicherheit",
    template: DE("Secrets entfernen. Zugänge über Umgebungsvariablen oder Platzhalter referenzieren."),
  },
  {
    keywords: /datenschutz|pii|personenbezogen/i,
    heading: "## Datenschutz",
    template: DE("Personenbezogene Daten anonymisieren (Platzhalter statt echter Namen)."),
  },
  {
    keywords: /ziel/i,
    heading: "## Ziel",
    template: DE("Das Ziel dieser Aufgabe in einem Satz präzise formulieren."),
  },
  {
    keywords: /rolle/i,
    heading: "## Rolle",
    template: DE("Rolle und Kompetenzen des Agenten beschreiben."),
  },
  {
    keywords: /kontext|context/i,
    heading: "## Kontext",
    template: DE("Relevanten Kontext ergänzen (Projekt, Umgebung, Voraussetzungen)."),
  },
  {
    keywords: /ausgabeformat|output|struktur, abschnitte/i,
    heading: "## Ausgabeformat",
    template: DE("Ausgabeformat definieren: Struktur, Abschnitte, Länge."),
  },
  {
    keywords: /anforderung|regel/i,
    heading: "## Anforderungen",
    template: DE("Anforderungen als nummerierte, imperative Regeln auflisten."),
  },
  {
    keywords: /constraint|grenzen|begrenz/i,
    heading: "## Constraints",
    template: DE("Explizite Grenzen definieren: »Erlaubt ist nur …«"),
  },
];

/**
 * Map a single recommendation to an editable block.
 *
 * Rule-based: the first keyword rule that matches determines the section
 * heading; unknown recommendations fall back to a numbered `## Ergänzung N`
 * block whose text carries the recommendation as guidance.
 */
export function mapRecommendationToBlock(
  recommendation: string,
  index: number,
): RecommendationBlock {
  const rule = RULES.find((r) => r.keywords.test(recommendation));
  const heading = rule
    ? rule.heading
    : `## Ergänzung ${index + 1}`;
  const text = rule
    ? `${heading}\n\n<!-- Empfehlung: ${recommendation} -->\n${rule.template}`
    : `${heading}\n\n<!-- Empfehlung: ${recommendation} -->\n<hier die Ergänzung formulieren>`;
  return {
    id: `rec-block-${index}`,
    sourceRecommendation: recommendation,
    heading,
    text,
  };
}

/** Build blocks for a list of selected recommendations (selection order kept). */
export function buildRecommendationBlocks(
  recommendations: string[],
): RecommendationBlock[] {
  return recommendations.map((rec, i) => mapRecommendationToBlock(rec, i));
}

/**
 * Build the preview content: original prompt followed by all blocks,
 * separated by blank lines. With no blocks this is the original content.
 */
export function buildPreviewContent(
  originalContent: string,
  blocks: RecommendationBlock[],
): string {
  if (blocks.length === 0) return originalContent;
  const blockText = blocks.map((b) => b.text.trim()).join("\n\n");
  const separator = originalContent.trim().length > 0 ? "\n\n" : "";
  return `${originalContent.trimEnd()}${separator}${blockText}\n`;
}
