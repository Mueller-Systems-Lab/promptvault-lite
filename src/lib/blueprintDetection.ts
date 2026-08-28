// =============================================================================
// PromptVault Lite — Blueprint Detection & Evaluation Engine
// =============================================================================
// Pure, deterministic, no side effects. No network, no LLM, no API.
//
// Architecture: mirrors promptContextEvaluation.ts in structure, extends it
// with blueprint-specific classification, evaluation, and contamination detection.
// =============================================================================

import type {
  ContentClass,
  BlueprintType,
  BlueprintContamination,
  BlueprintEvaluation,
  BlueprintDimensionScore,
  BlueprintImprovement,
  BlueprintDetectOutput,
} from "@/types";

// =============================================================================
// Helpers
// =============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function countHeadings(content: string): number {
  const matches = content.match(/^#{1,3}\s+.+$/gm);
  return matches ? matches.length : 0;
}

function contentLengthWithoutCode(content: string): number {
  return content.replace(/```[\s\S]*?```/g, "").length;
}

function codeBlockLength(content: string): number {
  const matches = content.match(/```[\s\S]*?```/g);
  if (!matches) return 0;
  return matches.reduce((sum, m) => sum + m.length, 0);
}

// =============================================================================
// Signal Detectors — Prompt vs Blueprint Classification
// =============================================================================

interface SignalDef {
  name: string;
  category: "prompt" | "blueprint" | "hybrid" | "guideline";
  detect: (content: string) => boolean;
}

const AGENT_PROMPT_HEADING_PATTERNS = [
  /^#+\s*(?:rolle|role)\b/im,
  /^#+\s*(?:aufgabe|task)\b/im,
  /^#+\s*(?:ergebnisformat|output\s*format)\b/im,
  /^#+\s*(?:kontextfenster-empfehlung|context\s*window|context\s*recommendation)\b/im,
  /^#+\s*(?:anforderungen|requirements)\b/im,
  /^#+\s*(?:hard\s*constraints|constraints|einschränkungen)\b/im,
];

const WORKFLOW_GOVERNANCE_PATTERNS = [
  /^#+\s*(?:verification\s*contract|verifikation|acceptance\s*criteria)\b/im,
  /^#+\s*(?:human\s*approval(?:\s*gate)?|review\s*scope)\b/im,
  /^#+\s*(?:evidence|nachweise?|belege?)\b/im,
  /^#+\s*(?:agenten-workflow|workflow|arbeitsphasen|red\s*tests)\b/im,
];

function countMatchingPatterns(content: string, patterns: RegExp[]): number {
  let count = 0;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) count++;
  }
  return count;
}

function detectClassificationTags(
  content: string,
  promptSignals: string[],
  blueprintSignals: string[],
  contaminationSignals: string[],
  guidelineSignals: string[],
): string[] {
  const tags = new Set<string>();

  if (
    guidelineSignals.includes("guideline_title") ||
    guidelineSignals.includes("guideline_directive") ||
    guidelineSignals.includes("guideline_rule_section")
  ) {
    tags.add("GUIDELINE");
  }
  if (
    promptSignals.includes("sectioned_agent_prompt") ||
    promptSignals.includes("role_definition")
  ) {
    tags.add("AGENT_PROMPT");
  }
  if (
    blueprintSignals.includes("system_architecture") ||
    blueprintSignals.includes("data_flow") ||
    /(?:architektur|architecture|datenfluss|data\s*flow)/i.test(content)
  ) {
    tags.add("ARCHITECTURE");
  }
  if (
    blueprintSignals.includes("workflow_governance_sections") ||
    /(?:workflow|human approval|reviewer-agent|verification contract|red tests)/i.test(
      content,
    )
  ) {
    tags.add("WORKFLOW");
  }
  if (
    blueprintSignals.includes("security_compliance_section") ||
    /(?:security|sicherheit|datenschutz|privacy|oauth|jwt|gdpr|dsgvo)/i.test(
      content,
    )
  ) {
    tags.add("SECURITY");
  }
  if (
    blueprintSignals.includes("evidence_portfolio") ||
    /(?:evidence|nachweis|beleg|screenshot|test output|gate status)/i.test(
      content,
    )
  ) {
    tags.add("EVIDENCE");
  }
  if (contaminationSignals.length > 0) {
    tags.add("CONTAMINATION_RISK");
  }

  return [...tags];
}

function buildClassificationReasons(
  contentClass: ContentClass,
  promptSignals: string[],
  blueprintSignals: string[],
  contaminationSignals: string[],
  content: string,
  guidelineSignals: string[] = [],
  hybridSignals: string[] = [],
): string[] {
  const reasons: string[] = [];

  if (promptSignals.includes("sectioned_agent_prompt")) {
    reasons.push(
      "Structured agent-prompt headings detected: Rolle/Aufgabe/Ergebnisformat/Kontext.",
    );
  }
  if (blueprintSignals.includes("workflow_governance_sections")) {
    reasons.push(
      "Workflow governance sections detected: Verification Contract, Human Approval, Evidence, or Red Tests.",
    );
  }
  if (
    blueprintSignals.includes("system_architecture") ||
    blueprintSignals.includes("data_flow")
  ) {
    reasons.push(
      "Blueprint structure detected from architecture or data-flow terminology.",
    );
  }
  if (contentClass === "DOC") {
    const hasWeakBlueprint = blueprintSignals.some(
      (s) => !STRONG_BLUEPRINT_SIGNALS.has(s),
    );
    if (hasWeakBlueprint) {
      reasons.push(
        "Documentation with architecture/documentation terms but no actionable blueprint criteria (acceptance criteria, verification, implementation plan).",
      );
    } else {
      reasons.push(
        "Structured headings were present, but prompt and blueprint signals stayed below the decision threshold.",
      );
    }
  }
  if (contentClass === "GUIDELINE") {
    reasons.push(
      "Guideline/policy document detected with directive language and rule-oriented structure.",
    );
  }
  if (contentClass === "PROMPT") {
    reasons.push(
      "Content classified as a task prompt: role, goal, or instruction patterns detected, but no blueprint/guideline structure.",
    );
  }
  if (contentClass === "CODE_FRAGMENT") {
    reasons.push(
      "Content appears to be a code fragment with minimal prompt or blueprint structure.",
    );
  }
  if (contaminationSignals.length > 0) {
    reasons.push(
      `Contamination review signals detected: ${contaminationSignals.join(", ")}.`,
    );
  }

  // UNKNOWN_NEEDS_REVIEW: build explicit fallback explanations
  if (contentClass === "UNKNOWN_NEEDS_REVIEW") {
    const unknownReasons = buildUnknownFallbackReasons(
      content,
      promptSignals,
      blueprintSignals,
      guidelineSignals,
      hybridSignals,
    );
    // Use unknown reasons if no other reasons exist
    if (reasons.length === 0) {
      return unknownReasons;
    }
    return [...reasons, ...unknownReasons];
  }

  if (
    reasons.length === 0 &&
    countHeadings(content) >= 2 &&
    content.trim().length > 0
  ) {
    reasons.push(
      "Content contains structured headings but limited classifier signals.",
    );
  }

  return reasons;
}

// =============================================================================
// UNKNOWN Fallback Reason Builder
// =============================================================================

/**
 * Builds actionable explanations for UNKNOWN_NEEDS_REVIEW classifications.
 * Analyses WHY content could not be reliably classified and produces
 * clear, honest reasons for the user.
 */
function buildUnknownFallbackReasons(
  content: string,
  promptSignals: string[],
  blueprintSignals: string[],
  guidelineSignals: string[],
  hybridSignals: string[],
): string[] {
  const trimmed = content.trim();
  const reasons: string[] = [];

  if (trimmed.length === 0) {
    reasons.push(
      "Empty or whitespace-only content: no signals available for classification.",
    );
    return reasons;
  }

  const headingCount = countHeadings(trimmed);
  const cleanLen = contentLengthWithoutCode(trimmed);
  const codeLen = codeBlockLength(trimmed);

  // Too short for any reliable classification
  if (cleanLen < 50) {
    reasons.push(
      "Content too short for reliable classification: insufficient text for signal detection.",
    );
    return reasons;
  }

  // Short with no signals at all
  if (
    cleanLen < 200 &&
    promptSignals.length === 0 &&
    blueprintSignals.length === 0 &&
    guidelineSignals.length === 0 &&
    hybridSignals.length === 0
  ) {
    reasons.push(
      "Low signal: no role, task, requirements, architecture, documentation or guideline structure detected.",
    );
    return reasons;
  }

  // Title-only: headings but barely any body text
  if (headingCount > 0 && cleanLen < headingCount * 25 + 60) {
    reasons.push(
      "Title-only content: headings present but insufficient body text for a reliable classification.",
    );
  }

  // Code-like fragment (no actual code blocks, but syntax-heavy text)
  const symbolChars = (trimmed.match(/[{}=;<>[\]|&]/g) || []).length;
  const symbolRatio = cleanLen > 0 ? symbolChars / cleanLen : 0;
  if (symbolRatio > 0.12 || (codeLen > 0 && cleanLen < codeLen * 2)) {
    reasons.push(
      "Code-like fragment: content appears to be code, config, or shell syntax without enough explanatory context for classification.",
    );
  }

  // List-only: predominantly bullet points without contextual prose
  const lines = trimmed.split("\n");
  const listLines = lines.filter((l) =>
    /^\s*[-*\d+.]\s+/.test(l.trim()),
  ).length;
  if (lines.length > 3 && listLines / lines.length > 0.45) {
    reasons.push(
      "List-only content: bullet-point list detected without surrounding prose for reliable classification.",
    );
  }

  // No specific reason found yet — build a mixed-weak-signals summary
  if (reasons.length === 0) {
    const weakSignalParts: string[] = [];
    if (promptSignals.length > 0)
      weakSignalParts.push(
        `${promptSignals.length} weak prompt signal(s) (${promptSignals.join(", ")})`,
      );
    if (blueprintSignals.length > 0)
      weakSignalParts.push(
        `${blueprintSignals.length} weak blueprint signal(s) (${blueprintSignals.join(", ")})`,
      );
    if (guidelineSignals.length > 0)
      weakSignalParts.push(
        `${guidelineSignals.length} weak guideline signal(s) (${guidelineSignals.join(", ")})`,
      );
    if (hybridSignals.length > 0)
      weakSignalParts.push(
        `${hybridSignals.length} hybrid signal(s) (${hybridSignals.join(", ")})`,
      );

    if (weakSignalParts.length > 0) {
      reasons.push(
        `Mixed weak signals: ${weakSignalParts.join("; ")} present, but none strong enough for a reliable ${headingCount >= 2 ? "PROMPT, BLUEPRINT, DOCUMENTATION or GUIDELINE" : "classification"}${headingCount >= 2 ? "." : "."}`,
      );
    } else {
      reasons.push(
        "Low signal: no role, task, requirements, architecture, documentation or guideline structure detected for a reliable classification.",
      );
    }
  }

  return reasons;
}

function appendLowConfidenceReason(
  reasons: string[],
  dimensions: BlueprintDimensionScore[],
  confidence: number,
): string[] {
  if (confidence >= 0.6) {
    return reasons;
  }

  const missingDimensions = dimensions
    .filter((dimension) => dimension.score === 0)
    .map((dimension) => dimension.name);

  const primaryGaps = missingDimensions.slice(0, 3);
  if (primaryGaps.length === 0) {
    return [
      ...reasons,
      "Low confidence because: only limited blueprint evidence was detected.",
    ];
  }

  return [
    ...reasons,
    `Low confidence because: missing ${primaryGaps.join(", ")}${missingDimensions.length > primaryGaps.length ? ", and other blueprint sections" : ""}.`,
  ];
}

const CLASSIFICATION_SIGNALS: SignalDef[] = [
  // ---- Prompt-specific signals ----
  {
    name: "role_definition",
    category: "prompt",
    detect: (c) =>
      /(?:you are (?:a|an)\s|du bist (?:ein|eine)\s|act as (?:a|an)\s|agiere als\s|role\s*:\s*[a-z]|rolle\s*:\s*[a-z])/i.test(
        c,
      ),
  },
  {
    name: "output_format_request",
    category: "prompt",
    detect: (c) =>
      /(?:return\s+(?:as|a|in|the)|output\s*(?:format|as|should)|respond\s+(?:with|in|using)|gib\s+(?:zurück|aus)\s+(?:als|in))/i.test(
        c,
      ),
  },
  {
    name: "simple_task_verb",
    category: "prompt",
    detect: (c) =>
      /^(?:write|create|generate|explain|summarize|translate|convert|list|describe|analyze|review|fix|implement|update)\s/i.test(
        c.trim(),
      ) ||
      /^(?:schreibe|erstelle|generiere|erkläre|fasse\s+zusammen|übersetze|konvertiere|liste|beschreibe|analysiere|prüfe|behebe|implementiere|aktualisiere)\s/i.test(
        c.trim(),
      ),
  },
  {
    name: "chatty_style",
    category: "prompt",
    detect: (c) =>
      /(?:can you|kannst du|please|bitte|would you|würdest du|help me|hilf mir|what (?:is|are)|was (?:ist|sind))/i.test(
        c,
      ),
  },
  {
    name: "few_shot_examples",
    category: "prompt",
    detect: (c) =>
      /(?:example|beispiel|e\.g\.|for instance|zum beispiel|z\.b\.|input.*output)/i.test(
        c,
      ) && c.length < 3000,
  },
  {
    name: "sectioned_agent_prompt",
    category: "prompt",
    detect: (c) => countMatchingPatterns(c, AGENT_PROMPT_HEADING_PATTERNS) >= 2,
  },

  // ---- Blueprint-specific signals ----
  {
    name: "system_architecture",
    category: "blueprint",
    detect: (c) =>
      /(?:system\s*architecture|systemarchitektur|component\s*(?:diagram|architecture|overview)|komponenten\s*(?:diagramm|architektur|übersicht)|architektur\s*(?:entscheidung|überblick|diagramm)|architecture\s*(?:decision|overview|diagram)|deployment\s*(?:architecture|model|diagram))/i.test(
        c,
      ),
  },
  {
    name: "roadmap_phases",
    category: "blueprint",
    detect: (c) =>
      /(?:phase\s*[1-9]|phase\s*(?:one|two|three)|sprint\s*[1-9]|milestone\s*[1-9]|roadmap|fahrplan|iteration\s*[1-9]|release\s*(?:plan|schedule)|MVP|minimum viable product|minimales\s+produkt)/i.test(
        c,
      ),
  },
  {
    name: "implementation_plan",
    category: "blueprint",
    detect: (c) =>
      /(?:implementation\s*plan|umsetzungsplan|implementierungsplan|work\s*breakdown|arbeitspakete|deliverables|liefergegenstände|task\s*breakdown|aufgaben\s*liste)/i.test(
        c,
      ),
  },
  {
    name: "data_flow",
    category: "blueprint",
    detect: (c) =>
      /(?:data\s*flow|datenfluss|data\s*model|datenmodell|entity\s*relationship|ER\s*diagram|API\s*(?:design|contract|endpoint)|schema\s*(?:design|definition)|database\s*(?:schema|design|migration))/i.test(
        c,
      ),
  },
  {
    name: "security_compliance_section",
    category: "blueprint",
    detect: (c) =>
      /^#+\s*(?:security|sicherheit|compliance|datenschutz|privacy|data\s*protection|GDPR|DSGVO|auth|authorization|threat\s*model)/im.test(
        c,
      ),
  },
  {
    name: "verification_contract",
    category: "blueprint",
    detect: (c) =>
      /(?:verification\s*contract|verifikations\s*vertrag|acceptance\s*criteria|akzeptanz\s*kriterien|definition\s*of\s*done|fertig\s*stellungs\s*kriterien)/i.test(
        c,
      ),
  },
  {
    name: "risk_limitations",
    category: "blueprint",
    detect: (c) =>
      /^#+\s*(?:risks?|risiken|known\s*limitations?|bekannte\s*einschränkungen|assumptions|annahmen|dependencies|abhängigkeiten)/im.test(
        c,
      ),
  },
  {
    name: "evidence_portfolio",
    category: "blueprint",
    detect: (c) =>
      /(?:evidence\s*portfolio|nachweis\s*portfolio|evidence\s*(?:required|must|artifacts)|test\s*evidence|CI\s*(?:pipeline|gate|status)|review\s*(?:agent|process|required))/i.test(
        c,
      ),
  },
  {
    name: "next_steps_handoff",
    category: "blueprint",
    detect: (c) =>
      /^#+\s*(?:next\s*steps?|nächste\s*schritte|handoff|übergabe|follow.?up|future\s*work|ausblick)/im.test(
        c,
      ),
  },
  {
    name: "defined_roles_not_prompt",
    category: "blueprint",
    detect: (c) =>
      /(?:agent\s*(?:role|responsibilit|type)|rolle\s*(?:des|der)\s*agenten|subagent|delegation\s*(?:rule|pattern)|reviewer|orchestrator)/i.test(
        c,
      ) && !/(?:you are|du bist|act as|agiere als)/i.test(c),
  },
  {
    name: "scope_definition",
    category: "blueprint",
    detect: (c) =>
      /^#+\s*(?:scope|umfang|in\s*scope|out\s*of\s*scope|what'?s\s*(?:in|out)|project\s*boundaries|projekt\s*grenzen)/im.test(
        c,
      ),
  },
  {
    name: "multi_component_structure",
    category: "blueprint",
    detect: (c) => {
      const headings = countHeadings(c);
      const hasArchitecture =
        /(?:module|component|service|layer|schicht|backend|frontend|database|datenbank|API|middleware|gateway)/i.test(
          c,
        );
      return headings >= 6 && hasArchitecture;
    },
  },
  {
    name: "workflow_governance_sections",
    category: "blueprint",
    detect: (c) => countMatchingPatterns(c, WORKFLOW_GOVERNANCE_PATTERNS) >= 2,
  },

  // ---- Hybrid signals (can appear in both) ----
  {
    name: "agent_workflow",
    category: "hybrid",
    detect: (c) =>
      /(?:workflow|pipeline|step\s+\d|process\s+flow|implement.*then.*test|code.*review.*merge|deploy.*pipeline)/i.test(
        c,
      ),
  },
  {
    name: "repo_reference",
    category: "hybrid",
    detect: (c) =>
      /(?:github\.com\/\w+\/\w+|gitlab\.com|bitbucket\.org|repository|repo\b|branch|commit|merge|pull\s*request|PR\b)/i.test(
        c,
      ),
  },
  {
    name: "issue_tracking",
    category: "hybrid",
    detect: (c) =>
      /(?:issue\s*[#:]\s*\d+|ticket\s*[#:]\s*\d+|task\s*[#:]\s*\d+|github\s*issue)/i.test(
        c,
      ),
  },

  // ---- Guideline / Policy signals ----
  {
    name: "guideline_title",
    category: "guideline",
    detect: (c) =>
      /^#+\s*(?:System-Richtlinie|Richtlinie|Guideline|Policy|Regelwerk|Leitlinie|Standards?|Prinzipien)\b/im.test(
        c,
      ),
  },
  {
    name: "guideline_directive",
    category: "guideline",
    detect: (c) =>
      /(?:Verzichte auf|Verwende|Achte auf|Halte dich|Nutze|Vermeide|Stelle sicher|Definiere|Fasse|Teile|Gilt als)\b/i.test(
        c,
      ),
  },
  {
    name: "guideline_rule_section",
    category: "guideline",
    detect: (c) =>
      /^#+\s*(?:Regeln?|Do|Don't|Guardrails|Constraints|Vorgaben?|Prinzipien|Anweisungen)\b/im.test(
        c,
      ),
  },
  {
    name: "guideline_domain_terms",
    category: "guideline",
    detect: (c) =>
      /(?:Token-Effizienz|BatchPrompting|Batch-Verarbeitung|Ausgabequalität|Skeleton-of-Thought|Kontext-Management|Output-Management|Prompt\s*Engineering|Token-?Budget)/i.test(
        c,
      ),
  },
  {
    name: "guideline_imperative_rules",
    category: "guideline",
    detect: (c) => {
      const lines = c.split("\n");
      let imperativeCount = 0;
      let totalLines = 0;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || /^#/.test(trimmed)) continue;
        totalLines++;
        if (
          /^(?:Verzichte|Verwende|Achte|Halte|Nutze|Vermeide|Definiere|Stelle|Fasse|Teile|Prüfe|Validier)/i.test(
            trimmed,
          ) ||
          /^(?:Do not|Don't|Always|Never|Use|Avoid|Ensure|Define|Keep|Apply)/i.test(
            trimmed,
          )
        ) {
          imperativeCount++;
        }
      }
      return totalLines >= 5 && imperativeCount >= 2;
    },
  },
];

// =============================================================================
// Strong vs Weak Blueprint Signals
// =============================================================================

/**
 * Strong blueprint signals indicate a buildable/specifiable system with
 * acceptance criteria, verification contracts, implementation plans,
 * or workflow governance. These alone or in combination can trigger
 * BLUEPRINT classification.
 *
 * Weak blueprint signals (system_architecture, data_flow, roadmap_phases,
 * multi_component_structure, defined_roles_not_prompt, next_steps_handoff,
 * security_compliance_section, scope_definition, risk_limitations) are
 * common in documentation and should not alone trigger BLUEPRINT.
 */
const STRONG_BLUEPRINT_SIGNALS = new Set<string>([
  "verification_contract",
  "evidence_portfolio",
  "implementation_plan",
  "workflow_governance_sections",
]);

// =============================================================================
// Content Classification
// =============================================================================

export function classifyContent(content: string): BlueprintDetectOutput {
  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return {
      content_class: "UNKNOWN_NEEDS_REVIEW",
      blueprint_type: null,
      contamination_status: "CLEAN",
      confidence: 0.3,
      tags: [],
      reasons: buildUnknownFallbackReasons(trimmed, [], [], [], []),
      prompt_signals: [],
      blueprint_signals: [],
      contamination_signals: [],
    };
  }

  // Count signals by category
  const promptSignals: string[] = [];
  const blueprintSignals: string[] = [];
  const hybridSignals: string[] = [];
  const guidelineSignals: string[] = [];

  for (const signal of CLASSIFICATION_SIGNALS) {
    if (signal.detect(trimmed)) {
      if (signal.category === "prompt") promptSignals.push(signal.name);
      else if (signal.category === "blueprint")
        blueprintSignals.push(signal.name);
      else if (signal.category === "guideline")
        guidelineSignals.push(signal.name);
      else hybridSignals.push(signal.name);
    }
  }

  // Separate strong (buildable/specifiable) from weak (architecture/doc-like) blueprint signals
  const strongBlueprintCount = blueprintSignals.filter((s) =>
    STRONG_BLUEPRINT_SIGNALS.has(s),
  ).length;

  const effectivePromptCount = promptSignals.length;
  const effectiveBlueprintCount = blueprintSignals.length;
  const hybridCount = hybridSignals.length;
  const effectiveGuidelineCount = guidelineSignals.length;

  // Determine content class
  let contentClass: ContentClass;
  let confidence: number;

  // Code fragment detection: high ratio of code blocks
  const cleanLen = contentLengthWithoutCode(trimmed);
  const codeLen = codeBlockLength(trimmed);
  if (codeLen > 0 && cleanLen < codeLen * 0.5) {
    contentClass = "CODE_FRAGMENT";
    confidence = 0.9;
  }
  // Guideline / Policy detection: guideline signals present, not a task prompt
  // Weak blueprint signals (architecture/doc terms) are allowed in guidelines
  else if (
    effectiveGuidelineCount >= 2 &&
    effectivePromptCount <= 1 &&
    strongBlueprintCount <= 1
  ) {
    contentClass = "GUIDELINE";
    confidence = clamp(0.55 + effectiveGuidelineCount * 0.08, 0.55, 0.95);
  }
  // Documentation detection: many headings, no prompt signals,
  // no strong blueprint signals (verification/AC/implementation),
  // at most 4 weak blueprint signals (architecture/doc terms allowed),
  // at most weak guideline signals
  else if (
    countHeadings(trimmed) >= 2 &&
    effectivePromptCount === 0 &&
    strongBlueprintCount === 0 &&
    effectiveBlueprintCount <= 4 &&
    effectiveGuidelineCount <= 1
  ) {
    contentClass = "DOC";
    confidence = 0.8;
  }
  // Note detection: short, unstructured, no classification signals
  else if (
    cleanLen < 300 &&
    effectivePromptCount === 0 &&
    effectiveBlueprintCount === 0 &&
    effectiveGuidelineCount === 0 &&
    hybridCount === 0
  ) {
    contentClass = "NOTE";
    confidence = 0.85;
  }
  // Pure prompt: has prompt signals, no blueprint signals
  else if (
    effectivePromptCount >= 1 &&
    effectiveBlueprintCount === 0 &&
    hybridCount < 3
  ) {
    contentClass = "PROMPT";
    confidence = clamp(
      0.5 + effectivePromptCount * 0.1 - hybridCount * 0.05,
      0.5,
      0.95,
    );
  }
  // Pure blueprint: has 2+ blueprint signals with at least 1 strong signal,
  // no prompt signals → strong evidence of buildable spec
  else if (
    effectiveBlueprintCount >= 2 &&
    effectivePromptCount === 0 &&
    strongBlueprintCount >= 1
  ) {
    contentClass = "BLUEPRINT";
    confidence = clamp(0.5 + effectiveBlueprintCount * 0.07, 0.5, 0.95);
  }
  // Pure blueprint fallback: 3+ blueprint signals (even all weak), no prompt signals
  // Only reached if DOC check above did not catch it (e.g., 5+ weak signals)
  else if (effectiveBlueprintCount >= 3 && effectivePromptCount === 0) {
    contentClass = "BLUEPRINT";
    confidence = clamp(
      0.5 + effectiveBlueprintCount * 0.07 - hybridCount * 0.03,
      0.5,
      0.9,
    );
  }
  // Strong prompt with some hybrid = prompt
  else if (effectivePromptCount >= 2 && effectiveBlueprintCount === 0) {
    contentClass = "PROMPT";
    confidence = 0.7;
  }
  // Both present with more blueprints than prompts → HYBRID (requires strong blueprint signal)
  else if (
    effectiveBlueprintCount > effectivePromptCount &&
    effectiveBlueprintCount >= 2 &&
    strongBlueprintCount >= 1
  ) {
    contentClass = "PROMPT_BLUEPRINT_HYBRID";
    confidence = clamp(
      0.4 + (effectiveBlueprintCount + effectivePromptCount) * 0.05,
      0.4,
      0.85,
    );
  }
  // Both present with more prompts than blueprints → HYBRID (requires strong blueprint signal)
  else if (
    effectivePromptCount > effectiveBlueprintCount &&
    effectiveBlueprintCount >= 2 &&
    strongBlueprintCount >= 1
  ) {
    contentClass = "PROMPT_BLUEPRINT_HYBRID";
    confidence = clamp(
      0.3 + (effectiveBlueprintCount + effectivePromptCount) * 0.06,
      0.3,
      0.8,
    );
  }
  // One blueprint signal with dominant prompt signals → PROMPT (not HYBRID)
  else if (effectivePromptCount >= 2 && effectiveBlueprintCount === 1) {
    contentClass = "PROMPT";
    confidence = 0.6;
  }
  // Roughly equal → HYBRID (requires strong blueprint signal)
  else if (
    effectivePromptCount >= 1 &&
    effectiveBlueprintCount >= 2 &&
    strongBlueprintCount >= 1
  ) {
    contentClass = "PROMPT_BLUEPRINT_HYBRID";
    confidence = clamp(
      0.3 + (effectiveBlueprintCount + effectivePromptCount) * 0.08,
      0.4,
      0.85,
    );
  }
  // Prompt with weak architecture/documentation blueprint signals → PROMPT (not HYBRID)
  // Catches agent prompts that mention architecture/data-flow without strong blueprint evidence
  else if (
    effectivePromptCount >= 1 &&
    strongBlueprintCount === 0 &&
    effectiveBlueprintCount <= 2
  ) {
    contentClass = "PROMPT";
    confidence = clamp(0.4 + effectivePromptCount * 0.05, 0.4, 0.75);
  }
  // Only hybrid signals or unclear → UNKNOWN_NEEDS_REVIEW
  else {
    contentClass = "UNKNOWN_NEEDS_REVIEW";
    // Dynamic confidence based on what weak signals are present
    const totalWeakSignals =
      effectivePromptCount +
      effectiveBlueprintCount +
      effectiveGuidelineCount +
      hybridCount;
    if (totalWeakSignals === 0) {
      confidence = 0.25; // Nothing at all to go on
    } else if (totalWeakSignals <= 2) {
      confidence = 0.3; // Very few weak signals
    } else {
      confidence = clamp(0.3 + totalWeakSignals * 0.03, 0.3, 0.5); // More signals but all weak
    }
  }

  // Detect blueprint sub-type
  const blueprintType = detectBlueprintTypeRanked(trimmed, contentClass);

  // Detect contamination
  const { contaminationStatus, contaminationSignals } =
    detectBlueprintContamination(trimmed);
  const tags = detectClassificationTags(
    trimmed,
    promptSignals,
    blueprintSignals,
    contaminationSignals,
    guidelineSignals,
  );
  const reasons = buildClassificationReasons(
    contentClass,
    promptSignals,
    blueprintSignals,
    contaminationSignals,
    trimmed,
    guidelineSignals,
    hybridSignals,
  );

  return {
    content_class: contentClass,
    blueprint_type:
      contentClass === "BLUEPRINT" || contentClass === "PROMPT_BLUEPRINT_HYBRID"
        ? blueprintType
        : null,
    contamination_status: contaminationStatus,
    confidence: Math.round(confidence * 100) / 100,
    tags,
    reasons,
    prompt_signals: promptSignals,
    blueprint_signals: blueprintSignals,
    guideline_signals: guidelineSignals,
    contamination_signals: contaminationSignals,
  };
}

// =============================================================================
// Blueprint Sub-Type Detection
// =============================================================================

function detectBlueprintType(
  content: string,
  contentClass: ContentClass,
): BlueprintType | null {
  if (
    contentClass !== "BLUEPRINT" &&
    contentClass !== "PROMPT_BLUEPRINT_HYBRID"
  ) {
    return null;
  }

  const checks: { type: BlueprintType; pattern: RegExp }[] = [
    {
      type: "architecture_blueprint",
      pattern:
        /(?:architecture|architektur|component\s*(?:diagram|architecture)|system\s*design|data\s*flow|datenfluss|entity\s*relationship|ER\s*diagram|microservice|monolith|layered\s*architecture)/i,
    },
    {
      type: "security_blueprint",
      pattern:
        /(?:security|sicherheit|threat\s*model|bedrohungs\s*modell|vulnerability|schwachstelle|penetration\s*test|CVE|authorization|OAuth[^A-Za-z]|JWT)/i,
    },
    {
      type: "compliance_blueprint",
      pattern:
        /(?:compliance|GDPR|DSGVO|HIPAA|SOX|ISO\s*27001|audit|prüfung|privacy|datenschutz|data\s*protection|consent|einwilligung|retention|aufbewahrung)/i,
    },
    {
      type: "deployment_blueprint",
      pattern:
        /(?:deployment|bereitstellung|infrastructure|infrastruktur|kubernetes|docker|container|cloud|AWS|Azure|GCP|CI\/CD|pipeline|release\s*(?:plan|process)|monitoring|logging)/i,
    },
    {
      type: "agent_workflow_blueprint",
      pattern:
        /(?:agent\s*(?:workflow|role|responsibility)|subagent|delegation|orchestrator|issue.*orchestrator|review.*agent|security.*agent|research.*agent|playwright.*agent)/i,
    },
    {
      type: "implementation_blueprint",
      pattern:
        /(?:implementation\s*plan|umsetzungsplan|phase\s*[1-9]|sprint\s*[1-9]|milestone|MVP|roadmap|task\s*breakdown|work\s*breakdown)/i,
    },
    {
      type: "product_blueprint",
      pattern:
        /(?:product\s*(?:vision|roadmap|strategy)|produkt\s*(?:vision|strategie)|feature\s*(?:plan|list|roadmap)|user\s*story|persona|market\s*(?:analysis|fit))/i,
    },
  ];

  for (const check of checks) {
    if (check.pattern.test(content)) return check.type;
  }

  return "generic_blueprint";
}

function detectBlueprintTypeRanked(
  content: string,
  contentClass: ContentClass,
): BlueprintType | null {
  if (
    contentClass !== "BLUEPRINT" &&
    contentClass !== "PROMPT_BLUEPRINT_HYBRID"
  ) {
    return null;
  }

  const checks: {
    type: BlueprintType;
    patterns: RegExp[];
    priority: number;
  }[] = [
    {
      type: "architecture_blueprint",
      patterns: [
        /(?:architecture|architektur|system\s*design|layered\s*architecture)/i,
        /(?:component\s*(?:diagram|architecture)|komponenten\s*(?:diagramm|architektur))/i,
        /(?:data\s*flow|datenfluss|entity\s*relationship|ER\s*diagram|microservice|monolith)/i,
      ],
      priority: 2,
    },
    {
      type: "security_blueprint",
      patterns: [
        /(?:security|sicherheit|threat\s*model|bedrohungs\s*modell)/i,
        /(?:vulnerability|schwachstelle|penetration\s*test|CVE)/i,
        /(?:authorization|OAuth[^A-Za-z]|JWT)/i,
      ],
      priority: 2,
    },
    {
      type: "compliance_blueprint",
      patterns: [
        /(?:compliance|GDPR|DSGVO|HIPAA|SOX|ISO\s*27001)/i,
        /(?:audit|prüfung|privacy|datenschutz|data\s*protection)/i,
        /(?:consent|einwilligung|retention|aufbewahrung)/i,
      ],
      priority: 1,
    },
    {
      type: "deployment_blueprint",
      patterns: [
        /(?:deployment|bereitstellung|infrastructure|infrastruktur)/i,
        /(?:kubernetes|docker|container|cloud|AWS|Azure|GCP)/i,
        /(?:CI\/CD|pipeline|release\s*(?:plan|process)|monitoring|logging)/i,
      ],
      priority: 1,
    },
    {
      type: "agent_workflow_blueprint",
      patterns: [
        /(?:agent\s*(?:workflow|role|responsibility)|subagent|delegation|orchestrator)/i,
        /(?:issue.*orchestrator|review.*agent|security.*agent|research.*agent|playwright.*agent)/i,
        /(?:verification\s*contract|human\s*approval|red\s*tests|review\s*scope|evidence)/i,
      ],
      priority: 3,
    },
    {
      type: "implementation_blueprint",
      patterns: [
        /(?:implementation\s*plan|umsetzungsplan|task\s*breakdown|work\s*breakdown)/i,
        /(?:phase\s*[1-9]|sprint\s*[1-9]|milestone|MVP|roadmap)/i,
      ],
      priority: 1,
    },
    {
      type: "product_blueprint",
      patterns: [
        /(?:product\s*(?:vision|roadmap|strategy)|produkt\s*(?:vision|strategie))/i,
        /(?:feature\s*(?:plan|list|roadmap)|user\s*story|persona|market\s*(?:analysis|fit))/i,
      ],
      priority: 1,
    },
  ];

  let bestType: BlueprintType | null = null;
  let bestScore = 0;
  let bestPriority = -1;

  for (const check of checks) {
    let score = 0;
    for (const pattern of check.patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) score++;
    }

    if (
      contentClass === "PROMPT_BLUEPRINT_HYBRID" &&
      check.type === "agent_workflow_blueprint"
    ) {
      score += 1;
    }

    if (
      score > bestScore ||
      (score === bestScore && check.priority > bestPriority)
    ) {
      bestType = check.type;
      bestScore = score;
      bestPriority = check.priority;
    }
  }

  return bestScore > 0 ? bestType : detectBlueprintType(content, contentClass);
}

// =============================================================================
// Blueprint Contamination Detection
// =============================================================================

interface ContaminationSignal {
  name: string;
  severity: "low" | "medium" | "high" | "critical";
  detect: (content: string) => boolean;
}

const CONTAMINATION_SIGNALS: ContaminationSignal[] = [
  // ---- Stale/foreign project references ----
  {
    name: "foreign_app_name",
    severity: "medium",
    detect: (c) =>
      /(?<!\bpromptvault-lite\b)(?<!\bPromptVault\b)(?:Positron|MietVisor|CiviPet|Prompt_Archiv)\b/i.test(
        c,
      ) && !/promptvault-lite/i.test(c),
  },
  {
    name: "stale_project_name",
    severity: "high",
    detect: (c) => /\bPrompt_Archiv\b/i.test(c),
  },
  // ---- Secrets/Tokens ----
  {
    name: "potential_secret",
    severity: "critical",
    detect: (c) =>
      /(?:api[_-]?key\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]|secret\s*[:=]\s*['"][A-Za-z0-9_\-]{12,}['"]|token\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]|password\s*[:=]\s*['"][^'"]{4,}['"]|access[_-]?key\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"])/i.test(
        c,
      ),
  },
  // ---- Stale run reports ----
  {
    name: "stale_run_report",
    severity: "medium",
    detect: (c) =>
      /(?:run\s*report|test run|test\s*results?)\s*(?:from|vom|dated?)\s*(?:202[0-5]|2026-[0-1][0-9]-\d{2})/i.test(
        c,
      ) && !/freshness|fresh|aktualität|stand:|as of:/i.test(c),
  },
  // ---- Stacktraces unrelated to blueprint ----
  {
    name: "raw_stacktrace",
    severity: "low",
    detect: (c) =>
      /(?:at\s+\w+\.\w+\s*\(.*:\d+:\d+\)|Caused by:|Exception in thread|panic:|thread '.*' panicked)/.test(
        c,
      ) &&
      !/error\s*handling|fehler\s*behandlung|debugging|troubleshooting/i.test(
        c,
      ),
  },
  // ---- Chat/transcript artifacts ----
  {
    name: "chat_artifact",
    severity: "low",
    detect: (c) =>
      /(?:User:|Assistant:|Human:|AI:|Bot:|user\s*said|assistant\s*replied|previous\s*message|vorherige\s*nachricht)/i.test(
        c,
      ) && !/example|beispiel|sample|vorlage/i.test(c),
  },
  // ---- Private legal/authority data ----
  {
    name: "private_legal_data",
    severity: "high",
    detect: (c) =>
      /(?:personalausweis|reisepass|geburtsdatum|sozialversicherungsnummer|steuer\s*id|steuer\s*nummer|bankverbindung|IBAN.*DE|kontonummer)/i.test(
        c,
      ),
  },
  // ---- Contradictory runtime info ----
  {
    name: "contradictory_runtime",
    severity: "medium",
    detect: (c) => {
      const hasLinux =
        /(?:ubuntu|debian|fedora|centos|red\s*hat|arch\s*linux|linux|bash|zsh)/i.test(
          c,
        );
      const hasWindows = /(?:windows|powershell|cmd|win32|msys|mingw)/i.test(c);
      const hasMac = /(?:macos|darwin|os\s*x|apple)/i.test(c);
      const osCount = [hasLinux, hasWindows, hasMac].filter(Boolean).length;
      return osCount > 1;
    },
  },
  // ---- Wrong model/agent claims ----
  {
    name: "unverifiable_model_claim",
    severity: "low",
    detect: (c) =>
      /(?:running\s*(?:on|with)|powered\s*by|using\s*(?:model|agent))\s*(?:GPT-5|Claude\s*[4-9]|Gemini\s*[3-9])/i.test(
        c,
      ),
  },
  // ---- Foreign URLs ----
  {
    name: "foreign_url",
    severity: "low",
    detect: (c) => {
      const urls = c.match(/https?:\/\/[^\s)]+/g);
      if (!urls || urls.length === 0) return false;
      // Check if URLs point to expected repos
      const foreignUrls = urls.filter(
        (u) =>
          !u.includes("github.com/Mueller-Systems-Lab/promptvault-lite") &&
          !u.includes("github.com/cli") &&
          !u.includes("github.com/tauri") &&
          !u.includes("nodejs.org") &&
          !u.includes("rust-lang.org") &&
          !u.includes("npmjs.com"),
      );
      return foreignUrls.length > 0;
    },
  },
];

function detectBlueprintContamination(content: string): {
  contaminationStatus: BlueprintContamination;
  contaminationSignals: string[];
} {
  const signals: string[] = [];
  let highestSeverity: "low" | "medium" | "high" | "critical" = "low";

  for (const sig of CONTAMINATION_SIGNALS) {
    if (sig.detect(content)) {
      signals.push(sig.name);
      const severityOrder: Record<string, number> = {
        low: 1,
        medium: 2,
        high: 3,
        critical: 4,
      };
      if (severityOrder[sig.severity] > severityOrder[highestSeverity]) {
        highestSeverity = sig.severity;
      }
    }
  }

  let status: BlueprintContamination;
  if (signals.length === 0) {
    status = "CLEAN";
  } else if (highestSeverity === "critical") {
    status = "BLOCKING_SENSITIVE_CONTENT";
  } else if (highestSeverity === "high") {
    status = "CONTAMINATED_NEEDS_REVIEW";
  } else {
    status = "POSSIBLE_CONTAMINATION";
  }

  return { contaminationStatus: status, contaminationSignals: signals };
}

// =============================================================================
// Blueprint Quality Evaluation
// =============================================================================

interface BlueprintCritDef {
  dimension: string;
  name: string;
  detect: (content: string) => number; // 0, 1, or 2
}

const BLUEPRINT_CRITERIA: BlueprintCritDef[] = [
  {
    dimension: "goal_clarity",
    name: "Goal Clarity",
    detect: (c) => {
      const hasExplicitGoal =
        /^#+\s*(?:ziel|goal|objective|zweck|purpose|vision|target)/im.test(c);
      const hasMeasurable =
        /(?:messbar|measurable|quantit|prozent|percent|KPI|metrik|metric|OKR|success\s*(?:criteria|metric)|erfolgs\s*kriterien)/i.test(
          c,
        );
      if (hasExplicitGoal && hasMeasurable) return 2;
      if (hasExplicitGoal) return 1;
      return 0;
    },
  },
  {
    dimension: "scope_sharpness",
    name: "Scope Sharpness",
    detect: (c) => {
      const hasScopeSection =
        /^#+\s*(?:scope|umfang|in\s*scope|out\s*of\s*scope|what'?s\s*(?:in|out)|boundaries|grenzen)/im.test(
          c,
        );
      const hasMvp =
        /(?:MVP|minimum viable|minimales\s+(?:produkt|set)|phase\s*1|first\s*(?:release|iteration)|v1\.0|initial\s*(?:release|version|scope))/i.test(
          c,
        );
      const hasExclusions =
        /(?:out\s*of\s*scope|nicht\s+(?:im|teil)|ausgeschlossen|excluded|not\s+(?:included|relevant|planned))/i.test(
          c,
        );
      if (hasScopeSection && hasMvp && hasExclusions) return 2;
      if (hasScopeSection && (hasMvp || hasExclusions)) return 1;
      if (hasScopeSection) return 1;
      return 0;
    },
  },
  {
    dimension: "architecture",
    name: "Architecture Completeness",
    detect: (c) => {
      const hasComponents =
        /(?:component|komponente|module|service|layer|schicht|microservice|API\s*(?:gateway|endpoint)|database|datenbank)/i.test(
          c,
        );
      const hasDataFlow =
        /(?:data\s*flow|datenfluss|pipeline|request\s*flow|message\s*queue|event\s*(?:bus|driven)|async|synchronous)/i.test(
          c,
        );
      const hasTechStack =
        /(?:tech\s*stack|technology\s*stack|technologie\s*stack|React|TypeScript|Rust|Tauri|Node\.js|PostgreSQL|SQLite|Docker|Kubernetes)/i.test(
          c,
        );
      if (hasComponents && hasDataFlow && hasTechStack) return 2;
      if (hasComponents && (hasDataFlow || hasTechStack)) return 1;
      if (hasComponents) return 1;
      return 0;
    },
  },
  {
    dimension: "feasibility",
    name: "Feasibility / Implementability",
    detect: (c) => {
      const hasPhases =
        /(?:phase\s*[1-9]|sprint\s*[1-9]|iteration\s*[1-9]|step\s*\d|schritt\s*\d)/i.test(
          c,
        );
      const hasEffort =
        /(?:effort|aufwand|estimat|schätzung|story\s*points?|person\s*(?:days?|weeks?|months?)|manntage|t-shirt\s*(?:size|sizing))/i.test(
          c,
        );
      const hasDependencies =
        /(?:dependenc|abhängigkeit|prerequisite|voraussetzung|blocked\s*by|requires|benötigt|depends\s*on)/i.test(
          c,
        );
      if (hasPhases && hasEffort && hasDependencies) return 2;
      if (hasPhases && (hasEffort || hasDependencies)) return 1;
      if (hasPhases) return 1;
      return 0;
    },
  },
  {
    dimension: "risk_coverage",
    name: "Risk Coverage",
    detect: (c) => {
      const hasRiskSection =
        /^#+\s*(?:risks?|risiken|known\s*limitations?|bekannte\s*einschränkungen|threats?|bedrohungen|challenges?|herausforderungen)/im.test(
          c,
        );
      const hasMitigations =
        /(?:mitigation|gegenmaßnahme|fallback|rollback|revert|backup|sicherung|contingency|notfall\s*plan)/i.test(
          c,
        );
      const hasAssumptions =
        /(?:assumption|annahme|hypothesis|hypothese|assumed|angenommen)/i.test(
          c,
        );
      if (hasRiskSection && hasMitigations && hasAssumptions) return 2;
      if (hasRiskSection && (hasMitigations || hasAssumptions)) return 1;
      if (hasRiskSection) return 1;
      return 0;
    },
  },
  {
    dimension: "security_privacy",
    name: "Security & Privacy",
    detect: (c) => {
      const hasSecuritySection =
        /^#+\s*(?:security|sicherheit|privacy|datenschutz|data\s*protection|auth|authorization)/im.test(
          c,
        );
      const hasSpecificMeasures =
        /(?:encryption|verschlüsselung|JWT|OAuth|OAuth2|TLS|HTTPS|RBAC|role.based|rate\s*limit|input\s*validation|sanitization|GDPR|DSGVO|consent|einwilligung|data\s*minimization|retention)/i.test(
          c,
        );
      const hasDataHandling =
        /(?:PII|personenbezogen|personal\s*data|sensitive\s*data|data\s*classification|data\s*flow|encryption\s*(?:at\s*rest|in\s*transit))/i.test(
          c,
        );
      if (hasSecuritySection && hasSpecificMeasures && hasDataHandling)
        return 2;
      if (hasSecuritySection && (hasSpecificMeasures || hasDataHandling))
        return 1;
      if (hasSecuritySection) return 1;
      return 0;
    },
  },
  {
    dimension: "testability",
    name: "Testability",
    detect: (c) => {
      const hasTestSection =
        /^#+\s*(?:tests?|testing|testen|test\s*(?:strategy|plan|approach)|QA|quality\s*assurance)/im.test(
          c,
        );
      const hasVerificationHeading =
        /^#+\s*(?:verification\s*contract|verifikation|acceptance\s*criteria)/im.test(
          c,
        );
      const hasTestTypes =
        /(?:unit\s*tests?|integration\s*tests?|e2e|end.to.end|regression\s*tests?|visual\s*tests?|playwright|vitest|jest|cargo\s*test)/i.test(
          c,
        );
      const hasRedTests =
        /(?:red\s*tests?|failing\s*tests?|tests?\s*(?:must|should)\s*(?:fail|pass)|before.*green|before.*pass)/i.test(
          c,
        );
      const hasTestFrame = hasTestSection || hasVerificationHeading;
      if (hasTestFrame && hasTestTypes && hasRedTests) return 2;
      if (hasTestFrame && hasTestTypes) return 1;
      if (hasTestFrame) return 1;
      return 0;
    },
  },
  {
    dimension: "evidence_readiness",
    name: "Evidence Readiness",
    detect: (c) => {
      const hasEvidenceSection =
        /^#+\s*(?:evidence|nachweise?|belege?|proof|verification|verifikation|acceptance|akzeptanz)/im.test(
          c,
        );
      const hasSpecificArtifacts =
        /(?:screenshot|bildschirmfoto|log\s*(?:file|output)|test\s*output|test\s*report|CI\s*(?:pipeline|status)|gate\s*(?:status|report)|diff\s*stat)/i.test(
          c,
        );
      const hasVerificationContract =
        /(?:verification\s*contract|verify\s+that|prüfe\s+dass|checklist|checkliste|definition\s*of\s*done)/i.test(
          c,
        );
      if (hasEvidenceSection && hasSpecificArtifacts && hasVerificationContract)
        return 2;
      if (
        hasEvidenceSection &&
        (hasSpecificArtifacts || hasVerificationContract)
      )
        return 1;
      if (hasEvidenceSection) return 1;
      return 0;
    },
  },
  {
    dimension: "context_purity",
    name: "Context Purity",
    detect: (c) => {
      const { contaminationSignals } = detectBlueprintContamination(c);
      const hasNone = contaminationSignals.length === 0;
      const hasRelevantContext =
        /^#+\s*(?:context|kontext|background|hintergrund|environment|umgebung|project\s*(?:overview|überblick))/im.test(
          c,
        );
      const hasFreshness =
        /(?:stand\s*:|as\s*of|dated?|vom|last\s*updated|current\s*as\s*of|version\s+\d+\.\d+|freshness|aktualität)/i.test(
          c,
        );
      if (hasNone && hasRelevantContext && hasFreshness) return 2;
      if (hasNone && hasRelevantContext) return 1;
      if (hasNone) return 1;
      return 0;
    },
  },
  {
    dimension: "next_step_clarity",
    name: "Next Step Clarity",
    detect: (c) => {
      const hasNextSteps =
        /^#+\s*(?:next\s*steps?|nächste\s*schritte|handoff|übergabe|follow.?up|action\s*items?|todo)/im.test(
          c,
        );
      const hasSpecificNext =
        /(?:implement|create|write|deploy|merge|release|review|test|document|approve|genehmigen)/i.test(
          c,
        );
      const hasPriority =
        /(?:priority|priorität|urgent|dringend|high|medium|low|blocker|blocked|next|first|zuerst)/i.test(
          c,
        );
      if (hasNextSteps && hasSpecificNext && hasPriority) return 2;
      if (hasNextSteps && hasSpecificNext) return 1;
      if (hasNextSteps) return 1;
      return 0;
    },
  },
];

// =============================================================================
// Blueprint Improvement Generation
// =============================================================================

function generateBlueprintImprovements(
  dimensionScores: BlueprintDimensionScore[],
): BlueprintImprovement[] {
  const improvements: BlueprintImprovement[] = [];

  const missingMessages: Record<string, string> = {
    "Goal Clarity":
      'Add an explicit goal section with measurable success criteria. E.g., "## Goal — Deliver a working MVP with all CI gates green."',
    "Scope Sharpness":
      "Define clear scope boundaries: what is in scope, what is out of scope, and what defines the MVP cut.",
    "Architecture Completeness":
      "Add architecture details: component overview, data flow, and technology stack choices.",
    "Feasibility / Implementability":
      "Add implementation phases with effort estimates and dependency ordering.",
    "Risk Coverage":
      'Add a "Risks & Known Limitations" section with mitigations, fallback plans, and explicit assumptions.',
    "Security & Privacy":
      "Add a security section covering authentication, authorization, data handling, and privacy compliance.",
    Testability:
      'Define a test strategy: what test types are needed, how red tests work, and what "all green" means.',
    "Evidence Readiness":
      "Add an evidence section specifying which artifacts prove completion (screenshots, test reports, CI status, diff stats).",
    "Context Purity":
      "Ensure all context references are relevant to this blueprint. Remove foreign app names, stale run reports, and unverifiable claims.",
    "Next Step Clarity":
      'Add a "Next Steps" section with concrete, prioritized actions for the next implementer.',
  };

  const partialMessages: Record<string, string> = {
    "Goal Clarity":
      "Make the goal more measurable with specific KPIs or success criteria.",
    "Scope Sharpness":
      "Sharpen the MVP cut line — what exactly is in the first deliverable?",
    "Architecture Completeness":
      "Add more architecture details — consider adding a data flow diagram description or tech stack summary.",
    "Feasibility / Implementability":
      "Add effort estimates or story points for each phase to improve planning accuracy.",
    "Risk Coverage":
      "Add specific mitigations or fallback plans for each identified risk.",
    "Security & Privacy":
      "Add specific security measures (encryption, auth protocol, input validation rules).",
    Testability:
      "Add specific test commands (e.g., `pnpm test`) and expected pass/fail counts.",
    "Evidence Readiness":
      "Specify exact evidence artifact types needed and where to post them.",
    "Context Purity":
      "Add a freshness/version marker and remove any lingering foreign project references.",
    "Next Step Clarity":
      "Add priorities (high/medium/low) or an ordering to the next steps.",
  };

  for (const dim of dimensionScores) {
    if (dim.score === 0) {
      improvements.push({
        dimension: dim.dimension,
        criterion: dim.name,
        message: missingMessages[dim.name] || `Add a "${dim.name}" section.`,
        priority: "high",
      });
    } else if (dim.score === 1) {
      improvements.push({
        dimension: dim.dimension,
        criterion: dim.name,
        message:
          partialMessages[dim.name] ||
          `Strengthen the "${dim.name}" section with more specific details.`,
        priority: "medium",
      });
    }
  }

  // Sort: high first
  improvements.sort((a, b) => {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });

  return improvements;
}

// =============================================================================
// Main Blueprint Evaluation Function
// =============================================================================

export function evaluateBlueprint(
  content: string,
  evaluatedAt?: string,
): BlueprintEvaluation {
  const evAt = evaluatedAt ?? "";
  const trimmed = content.trim();

  // Classify first
  const classification = classifyContent(trimmed);

  if (trimmed.length === 0) {
    return buildEmptyEvaluation(classification, evAt);
  }

  // Score each dimension
  const dimensions: BlueprintDimensionScore[] = BLUEPRINT_CRITERIA.map(
    (crit) => {
      const score = clamp(crit.detect(trimmed), 0, 2);
      let details: string;
      if (score === 0) details = `Missing: ${crit.name} is not addressed.`;
      else if (score === 1)
        details = `Partially present: ${crit.name} could be strengthened.`;
      else details = `Clearly defined: ${crit.name} is well-specified.`;

      return {
        dimension: crit.dimension,
        name: crit.name,
        score,
        max_score: 2,
        details,
      };
    },
  );

  // Calculate scores (0-100 each)
  function calcDimScore(dimName: string): number {
    const dims = dimensions.filter((d) => d.dimension === dimName);
    if (dims.length === 0) return 0;
    const total = dims.reduce((s, d) => s + d.score, 0);
    return Math.round((total / (dims.length * 2)) * 100);
  }

  const goalClarityScore = calcDimScore("goal_clarity");
  const scopeSharpnessScore = calcDimScore("scope_sharpness");
  const architectureScore = calcDimScore("architecture");
  const feasibilityScore = calcDimScore("feasibility");
  const riskCoverageScore = calcDimScore("risk_coverage");
  const securityPrivacyScore = calcDimScore("security_privacy");
  const testabilityScore = calcDimScore("testability");
  const evidenceReadinessScore = calcDimScore("evidence_readiness");
  const contextPurityScore = calcDimScore("context_purity");
  const nextStepClarityScore = calcDimScore("next_step_clarity");

  // Overall score: weighted average
  const weights: Record<string, number> = {
    goal_clarity: 0.15,
    scope_sharpness: 0.15,
    architecture: 0.15,
    feasibility: 0.1,
    risk_coverage: 0.1,
    security_privacy: 0.1,
    testability: 0.05,
    evidence_readiness: 0.05,
    context_purity: 0.1,
    next_step_clarity: 0.05,
  };

  const allScores: Record<string, number> = {
    goal_clarity: goalClarityScore,
    scope_sharpness: scopeSharpnessScore,
    architecture: architectureScore,
    feasibility: feasibilityScore,
    risk_coverage: riskCoverageScore,
    security_privacy: securityPrivacyScore,
    testability: testabilityScore,
    evidence_readiness: evidenceReadinessScore,
    context_purity: contextPurityScore,
    next_step_clarity: nextStepClarityScore,
  };

  let overallScore = 0;
  for (const [key, weight] of Object.entries(weights)) {
    overallScore += (allScores[key] ?? 0) * weight;
  }
  overallScore = clamp(Math.round(overallScore), 0, 100);

  // Build strengths, warnings, missingElements
  const strengths: string[] = [];
  const warnings: string[] = [];
  const missingElements: string[] = [];

  for (const dim of dimensions) {
    if (dim.score === 2)
      strengths.push(`[${dim.dimension}] ${dim.name}: ${dim.details}`);
    else if (dim.score === 1)
      warnings.push(`[${dim.dimension}] ${dim.name}: ${dim.details}`);
    else missingElements.push(`[${dim.dimension}] ${dim.name}: ${dim.details}`);
  }

  // Add contamination warning if contaminated
  if (
    classification.contamination_status === "CONTAMINATED_NEEDS_REVIEW" ||
    classification.contamination_status === "BLOCKING_SENSITIVE_CONTENT"
  ) {
    warnings.unshift(
      `CONTAMINATION: ${classification.contamination_signals.join(", ")} detected. Review required.`,
    );
  }

  if (classification.contamination_status === "POSSIBLE_CONTAMINATION") {
    warnings.unshift(
      `Possible contamination: ${classification.contamination_signals.join(", ")}. Verify before using.`,
    );
  }

  // Generate improvements
  const suggestedImprovements = generateBlueprintImprovements(dimensions);

  // Calculate confidence
  const nonZeroCount = dimensions.filter((d) => d.score > 0).length;
  const confidence =
    dimensions.length > 0
      ? clamp(0.2 + (nonZeroCount / dimensions.length) * 0.8, 0.2, 1.0)
      : 0.3;
  const classificationReasons = appendLowConfidenceReason(
    classification.reasons ?? [],
    dimensions,
    confidence,
  );

  return {
    content_class: classification.content_class,
    blueprint_type: classification.blueprint_type,
    contamination_status: classification.contamination_status,
    classification_tags: classification.tags ?? [],
    classification_reasons: classificationReasons,
    goal_clarity_score: goalClarityScore,
    scope_sharpness_score: scopeSharpnessScore,
    architecture_score: architectureScore,
    feasibility_score: feasibilityScore,
    risk_coverage_score: riskCoverageScore,
    security_privacy_score: securityPrivacyScore,
    testability_score: testabilityScore,
    evidence_readiness_score: evidenceReadinessScore,
    context_purity_score: contextPurityScore,
    overall_score: overallScore,
    dimensions,
    strengths,
    warnings,
    missing_elements: missingElements,
    suggested_improvements: suggestedImprovements,
    confidence: Math.round(confidence * 100) / 100,
    evaluated_at: evAt,
  };
}

function buildEmptyEvaluation(
  classification: BlueprintDetectOutput,
  evaluatedAt: string,
): BlueprintEvaluation {
  const emptyDimensions: BlueprintDimensionScore[] = BLUEPRINT_CRITERIA.map(
    (c) => ({
      dimension: c.dimension,
      name: c.name,
      score: 0,
      max_score: 2,
      details: `Missing: blueprint has no content.`,
    }),
  );

  return {
    content_class: classification.content_class,
    blueprint_type: null,
    contamination_status: "CLEAN",
    classification_tags: classification.tags ?? [],
    classification_reasons: classification.reasons ?? [],
    goal_clarity_score: 0,
    scope_sharpness_score: 0,
    architecture_score: 0,
    feasibility_score: 0,
    risk_coverage_score: 0,
    security_privacy_score: 0,
    testability_score: 0,
    evidence_readiness_score: 0,
    context_purity_score: 0,
    overall_score: 0,
    dimensions: emptyDimensions,
    strengths: [],
    warnings: ["Blueprint content is empty. Add content to enable evaluation."],
    missing_elements: ["No blueprint content to evaluate."],
    suggested_improvements: [
      {
        dimension: "goal_clarity",
        criterion: "Goal Clarity",
        message:
          "Start by defining the blueprint's goal: what should this blueprint achieve?",
        priority: "high",
      },
    ],
    confidence: 1.0,
    evaluated_at: evaluatedAt,
  };
}
