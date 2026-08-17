// =============================================================================
// PromptVault Lite — Typisierte Datenmodelle
// =============================================================================

export interface PromptItem {
  id: string;
  file_path: string;
  file_name: string;
  title: string;
  description: string;
  category: string;
  version: string;
  tags: string[];
  content: string;
  raw_frontmatter: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  is_favorite: boolean;
}

export interface PromptEvaluation {
  id: string;
  prompt_id: string;
  overall_score: number;
  criteria: EvaluationCriterion[];
  missing_sections: string[];
  recommendations: string[];
  evaluated_at: string;
}

export interface EvaluationCriterion {
  name: string;
  score: number;
  max_score: number;
  weight: number;
  details: string;
}

export interface PromptHygiene {
  id: string;
  prompt_id: string;
  hygiene_score: number;
  status: HygieneStatus;
  artifacts: DetectedArtifact[];
  analyzed_at: string;
}

export type HygieneStatus = "clean" | "warning" | "critical";

export interface DetectedArtifact {
  id: string;
  category: ArtifactCategory;
  severity: "info" | "warning" | "critical";
  match: string;
  line: number;
  column: number;
  replacement_suggestion: string | null;
}

export type ArtifactCategory =
  | "PROJECT_ARTIFACT"
  | "REPO_REFERENCE"
  | "FILE_PATH"
  | "ISSUE_REFERENCE"
  | "TEST_REPORT"
  | "LOG_LINE"
  | "STACKTRACE"
  | "BUILD_OUTPUT"
  | "JSON_DUMP"
  | "CODE_DUMP"
  | "PII"
  | "SECRET"
  | "CHAT_META"
  | "SCOPE_POLLUTION"
  | "OCR_RESIDUE"
  | "ROLE_MISMATCH"
  | "MISSING_STRUCTURE"
  | "EVIDENCE_BLOCK";

export interface AnalysisReport {
  evaluations: PromptEvaluation[];
  hygiene: PromptHygiene[];
  total_prompts: number;
  average_score: number;
}

// --- Filter Types ---

// --- Export Types ---

export type ExportFormat = "json" | "markdown" | "zip";

export interface ExportProgressPayload {
  current: number;
  total: number;
}

// --- Filter Types ---

export interface PromptFilters {
  search: string;
  category: string | null;
  minScore: number;
  maxScore: number;
  hygieneStatus: HygieneStatus | null;
  tags: string[];
  favoritesOnly: boolean;
}

export const DEFAULT_FILTERS: PromptFilters = {
  search: "",
  category: null,
  minScore: 0,
  maxScore: 100,
  hygieneStatus: null,
  tags: [],
  favoritesOnly: false,
};

// --- File Tree Types ---

export interface FileTreeNode {
  name: string;
  path: string;
  is_directory: boolean;
  children: FileTreeNode[];
  prompt_id?: string;
  score?: number;
  is_favorite?: boolean;
  /** Transient: Map used during tree construction (O(1) lookup). Removed before rendering. */
  _childrenMap?: Map<string, FileTreeNode>;
}

// =============================================================================
// Prompt & Context Engineering Evaluation Types
// =============================================================================

export type PromptType =
  | "simple_prompt"
  | "structured_prompt"
  | "agentic_prompt";

export type ContextProfile = "minimal" | "moderate" | "rich" | "overloaded";

export interface ContextCriterion {
  dimension: "prompt_engineering" | "context_engineering" | "agent_readiness";
  name: string;
  score: number; // 0, 1, or 2
  max_score: number; // always 2
  details: string;
}

export interface SuggestedImprovement {
  dimension: "prompt_engineering" | "context_engineering" | "agent_readiness";
  criterion: string;
  message: string;
  priority: "high" | "medium" | "low";
}

export type RiskFlagType =
  | "ambiguous_task"
  | "missing_goal"
  | "missing_output_format"
  | "missing_constraints"
  | "missing_verification"
  | "context_missing"
  | "context_overload"
  | "source_of_truth_missing"
  | "mixed_objectives"
  | "scope_creep_risk"
  | "no_human_approval"
  | "no_evidence_contract"
  | "unbounded_agent_autonomy"
  | "stale_or_undated_context";

export interface RiskFlag {
  flag: RiskFlagType;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  score_penalty: number;
}

export interface PromptContextEvaluation {
  // Type detection
  detected_prompt_type: PromptType;
  detected_context_profile: ContextProfile;

  // Scores (0-100, higher is better)
  prompt_engineering_score: number;
  context_engineering_score: number;
  agent_readiness_score: number;
  robustness_score: number; // 100 = low risk, 0 = high risk
  overall_score: number;

  // Structured findings
  criteria: ContextCriterion[];
  strengths: string[];
  warnings: string[];
  missing_elements: string[];
  suggested_improvements: SuggestedImprovement[];
  risk_flags: RiskFlag[];

  // Metadata
  confidence: number; // 0.0-1.0
  evaluated_at: string;
}

// =============================================================================
// Prompt Optimization Engine Types
// =============================================================================

export type OptimizationMode = "conservative" | "balanced" | "aggressive";

export interface OptimizationDiff {
  original: string;
  optimized: string;
  changes: OptimizationChange[];
  warnings: string[];
}

export interface OptimizationChange {
  type:
    | "whitespace"
    | "structure"
    | "content"
    | "format"
    | "add_section"
    | "replace_section"
    | "reorder";
  description: string;
}

/** Result of optimized prompt quality validation */
export interface OptimizationQualityResult {
  passed: boolean;
  unresolved_placeholders: string[];
  empty_sections: string[];
  warnings: string[];
  structural_improvement_confirmed: boolean;
}

// =============================================================================
// Typed Local Action Layer Types
// =============================================================================

/** All registered action names */
export type ActionName =
  | "prompts.search"
  | "prompts.get"
  | "prompts.create"
  | "prompts.update"
  | "prompts.score"
  | "prompts.detect_artifacts"
  | "prompts.optimize"
  | "blueprints.detect"
  | "blueprints.evaluate"
  | "blueprints.optimize"
  | "collections.list"
  | "qa.load_fixture"
  | "qa.compare_score";

/** Risk level for an action */
export type ActionRisk = "low" | "medium" | "high" | "critical";

/** Read/Write classification */
export type ActionAccess = "read" | "write";

/** UI state impact of an action */
export type UIStateImpact = "none" | "selection" | "navigation" | "modal";

/** Typed contract for a single action */
export interface ActionContract {
  name: ActionName;
  description: string;
  risk: ActionRisk;
  access: ActionAccess;
  uiStateImpact: UIStateImpact;
  approvalRequired: boolean;
  evidenceRequired: boolean;
  validateInput: (input: unknown) => ValidationResult;
  validateOutput: (output: unknown) => ValidationResult;
}

/** Validation result with optional errors */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Evidence log result types */
export type EvidenceResult =
  | "success"
  | "error"
  | "blocked"
  | "approved"
  | "denied";

/** Evidence log entry for every action call */
export interface EvidenceLogEntry {
  timestamp: string;
  action: ActionName | "(unknown)";
  input_hash: string;
  result: EvidenceResult;
  duration_ms: number;
  error?: string;
}

/** Input type for prompts.search */
export interface SearchInput {
  query: string;
  filters?: PromptFilters;
  limit?: number;
  offset?: number;
}

/** Output type for prompts.search */
export interface SearchOutput {
  results: PromptItem[];
  total: number;
  query: string;
  duration_ms: number;
}

/** Input type for prompts.score */
export interface ScoreInput {
  prompt_id: string;
  content?: string;
}

/** Output type for prompts.score */
export interface ScoreOutput {
  quality: PromptEvaluation;
  hygiene: PromptHygiene;
  context: PromptContextEvaluation;
  combined_score: number;
}

/** Input type for prompts.detect_artifacts */
export interface DetectArtifactsInput {
  content: string;
}

/** Output type for prompts.detect_artifacts */
export interface DetectArtifactsOutput {
  artifacts: DetectedArtifact[];
  hygiene_score: number;
  status: HygieneStatus;
  categories_found: ArtifactCategory[];
}

/** Input type for prompts.optimize */
export interface OptimizeInput {
  content: string;
  mode: OptimizationMode;
  target_format?: "standard" | "agentic";
}

/** Output type for prompts.optimize */
export interface OptimizeOutput {
  original: string;
  optimized: string;
  changes: OptimizationChange[];
  warnings: string[];
  before_score?: number;
  after_score?: number;
}

/** Input type for prompts.create */
export interface CreatePromptInput {
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  description?: string;
}

/** Output type for prompts.create */
export interface CreatePromptOutput {
  prompt: PromptItem;
  created: boolean;
}

/** Input type for prompts.update */
export interface UpdatePromptInput {
  prompt_id: string;
  content?: string;
  title?: string;
  category?: string;
  tags?: string[];
  description?: string;
}

/** Output type for prompts.update */
export interface UpdatePromptOutput {
  prompt: PromptItem;
  updated: boolean;
  changed_fields: string[];
}

/** Output type for collections.list */
export interface CollectionListOutput {
  collections: CollectionSummary[];
  total_prompts: number;
}

export interface CollectionSummary {
  category: string;
  count: number;
  avg_score: number;
}

/** Input type for qa.load_fixture */
export interface LoadFixtureInput {
  fixture_name: string;
}

/** Output type for qa.load_fixture */
export interface LoadFixtureOutput {
  content: string;
  loaded: boolean;
}

/** Input type for qa.compare_score */
export interface CompareScoreInput {
  prompt_id_a: string;
  prompt_id_b: string;
}

/** Output type for qa.compare_score */
export interface CompareScoreOutput {
  a: { overall_score: number; prompt_engineering_score: number };
  b: { overall_score: number; prompt_engineering_score: number };
  delta: number;
  better: "a" | "b" | "tie";
}

// =============================================================================
// Blueprint Classification, Evaluation & Optimization Types
// =============================================================================

/** Content classification: what kind of document is this? */
export type ContentClass =
  | "PROMPT"
  | "BLUEPRINT"
  | "PROMPT_BLUEPRINT_HYBRID"
  | "NOTE"
  | "DOC"
  | "CODE_FRAGMENT"
  | "GUIDELINE"
  | "UNKNOWN_NEEDS_REVIEW";

/** Blueprint sub-type for more granular classification */
export type BlueprintType =
  | "architecture_blueprint"
  | "product_blueprint"
  | "implementation_blueprint"
  | "agent_workflow_blueprint"
  | "security_blueprint"
  | "compliance_blueprint"
  | "deployment_blueprint"
  | "generic_blueprint";

/** Contamination status for blueprint content */
export type BlueprintContamination =
  | "CLEAN"
  | "POSSIBLE_CONTAMINATION"
  | "CONTAMINATED_NEEDS_REVIEW"
  | "BLOCKING_SENSITIVE_CONTENT";

/** Blueprint dimension scores */
export interface BlueprintDimensionScore {
  dimension: string;
  name: string;
  score: number; // 0, 1, or 2
  max_score: number; // always 2
  details: string;
}

/** Blueprint improvement suggestion */
export interface BlueprintImprovement {
  dimension: string;
  criterion: string;
  message: string;
  priority: "high" | "medium" | "low";
}

/** Full blueprint evaluation result */
export interface BlueprintEvaluation {
  // Classification
  content_class: ContentClass;
  blueprint_type: BlueprintType | null;
  contamination_status: BlueprintContamination;
  classification_tags?: string[];
  classification_reasons?: string[];

  // Scores (0-100, higher is better)
  goal_clarity_score: number;
  scope_sharpness_score: number;
  architecture_score: number;
  feasibility_score: number;
  risk_coverage_score: number;
  security_privacy_score: number;
  testability_score: number;
  evidence_readiness_score: number;
  context_purity_score: number;
  overall_score: number;

  // Structured findings
  dimensions: BlueprintDimensionScore[];
  strengths: string[];
  warnings: string[];
  missing_elements: string[];
  suggested_improvements: BlueprintImprovement[];

  // Metadata
  confidence: number; // 0.0-1.0
  evaluated_at: string;
}

/** Blueprint optimization modes */
export type BlueprintOptimizationMode =
  | "conservative"
  | "balanced"
  | "aggressive";

/** Blueprint optimization diff */
export interface BlueprintOptimizationDiff {
  original: string;
  optimized: string;
  changes: OptimizationChange[];
  warnings: string[];
  contamination_cleaned: boolean;
}

/** Blueprint optimization quality result */
export interface BlueprintOptimizationQualityResult {
  passed: boolean;
  unresolved_placeholders: string[];
  empty_sections: string[];
  warnings: string[];
  structural_improvement_confirmed: boolean;
  contamination_resolved: boolean;
}

// ---- Blueprint Action Input/Output Types ----

/** Input type for blueprints.detect */
export interface BlueprintDetectInput {
  content: string;
}

/** Output type for blueprints.detect */
export interface BlueprintDetectOutput {
  content_class: ContentClass;
  blueprint_type: BlueprintType | null;
  contamination_status: BlueprintContamination;
  confidence: number;
  tags?: string[];
  reasons?: string[];
  // Classification signals found
  prompt_signals: string[];
  blueprint_signals: string[];
  guideline_signals?: string[];
  contamination_signals: string[];
}

/** Input type for blueprints.evaluate */
export interface BlueprintEvaluateInput {
  content: string;
}

/** Output type for blueprints.evaluate */
export interface BlueprintEvaluateOutput {
  evaluation: BlueprintEvaluation;
}

/** Input type for blueprints.optimize */
export interface BlueprintOptimizeInput {
  content: string;
  mode: BlueprintOptimizationMode;
}

/** Output type for blueprints.optimize */
export interface BlueprintOptimizeOutput {
  original: string;
  optimized: string;
  changes: OptimizationChange[];
  warnings: string[];
  contamination_cleaned: boolean;
  before_evaluation: BlueprintEvaluation;
  after_evaluation: BlueprintEvaluation;
}

/** Action dispatch result */
export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  evidence?: EvidenceLogEntry;
}

// =============================================================================
// Missing-Info-Gate Types (#216)
// =============================================================================

/** Supported input widget types for missing-info questions. */
export type MissingInfoInputType =
  | "free_text"
  | "free_multiline"
  | "single_select"
  | "multi_select"
  | "boolean";

/** Classification tier for detected gaps. */
export type MissingInfoCategory = "REQUIRED" | "RECOMMENDED" | "OPTIONAL";

/** Sources from which a gap was detected. */
export type MissingInfoSource =
  | "prompt_engineering"
  | "context_engineering"
  | "agent_readiness"
  | "blueprint"
  | "risk_flag"
  | "hygiene";

/**
 * A raw detected gap — before classification.
 * Produced by `missingInfoDetector.ts`.
 */
export interface MissingInfoItem {
  /** Unique ID (e.g. "MISS_PE_001"). */
  id: string;
  /** Origin dimension of the gap. */
  source: MissingInfoSource;
  /** Human-readable name (e.g. "Zieldefinition"). */
  label: string;
  /** Concrete question for the user (German). */
  question: string;
  /** Short rationale why this information matters. */
  rationale: string;
  /** Expected answer format — determines the UI widget. */
  inputType: MissingInfoInputType;
  /** For select/multi_select: available options. */
  options?: string[];
  /** Placeholder text for the input field. */
  placeholder?: string;
  /** Suggested default value (used for "Mit Annahmen fortfahren"). */
  defaultValue?: string;
  /** Maximum answer length in characters (0 = unlimited). */
  maxLength?: number;
}

/**
 * A classified gap with tier and reason.
 * Produced by `missingInfoClassifier.ts`.
 */
export interface ClassifiedMissingInfo extends MissingInfoItem {
  /** Classification tier. */
  tier: MissingInfoCategory;
  /** Rationale for the classification (for dev/debug mode). */
  classificationReason: string;
}

/** A user's answer to a missing-info question. */
export interface MissingInfoAnswer {
  /** ID of the associated question. */
  itemId: string;
  /** The user-entered/selected value. */
  value: string;
  /** Timestamp of the answer. */
  answeredAt: string;
}

/** Lifecycle status of a gate session. */
export type GateSessionStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "SKIPPED"
  | "ASSUMPTIONS"
  | "CANCELLED";

/** Outcome when the gate session ends with a decision. */
export type GateOutcome = "COMPLETED" | "SKIPPED" | "ASSUMPTIONS";

/** A single gate session — ephemeral, per promptId. */
export interface MissingInfoSession {
  sessionId: string;
  promptId: string;
  startedAt: string;
  /** All classified questions. */
  items: ClassifiedMissingInfo[];
  /** User answers (itemId → answer). */
  answers: Record<string, MissingInfoAnswer>;
  /** Current lifecycle status. */
  status: GateSessionStatus;
  /** Outcome if the session was ended. */
  outcome: GateOutcome | null;
  /** Enriched prompt content (original + answers as Markdown). */
  enrichedContent: string | null;
}

/** Enriched prompt context stored after gate completion. */
export interface EnrichedPromptContext {
  originalContent: string;
  enrichedContent: string;
  answers: MissingInfoAnswer[];
  gateOutcome: GateOutcome;
  sessionId: string;
  enrichedAt: string;
}

// =============================================================================
// Constraint Checker Types (shared with #215)
// =============================================================================

/** Categories of hard constraints extractable from prompt text. */
export type ConstraintCategory =
  | "offline_only"
  | "max_length"
  | "no_examples"
  | "language"
  | "format_lock"
  | "tool_restriction"
  | "approval_required"
  | "scope_boundary";

/** A hard constraint extracted from prompt text. */
export interface HardConstraint {
  id: string;
  constraintText: string;
  category: ConstraintCategory;
  severity: "hard" | "soft";
  position: { line: number; column: number } | null;
}

/** A conflict between a user answer and a hard constraint. */
export interface ConstraintConflict {
  id: string;
  constraint: HardConstraint;
  conflictingSource: string;
  description: string;
  severity: "blocking" | "warning";
  resolutions: ConflictResolutionOption[];
  selectedResolution: ConflictResolution | null;
}

/** An option the user can choose to resolve a conflict. */
export interface ConflictResolutionOption {
  id: string;
  label: string;
  description: string;
  consequence: string;
}

/** The resolution the user selected for a conflict. */
export interface ConflictResolution {
  optionId: string;
  resolvedAt: string;
}

/**
 * Optional forward-reference for DirectionProfile from #215.
 * Defined here so constraintChecker can reference it without importing #215 code.
 * NOT modified by #215 — DirectionProfile (below) extends this concept.
 */
export interface DirectionProfileReference {
  profileId: string;
  label: string;
  /** Constraint categories this profile is compatible with. */
  compatibleConstraintCategories: ConstraintCategory[];
  /** Constraint categories that conflict with this profile. */
  conflictingConstraintCategories: ConstraintCategory[];
}

// =============================================================================
// Direction Profiles Types (#215)
// =============================================================================

// ---------------------------------------------------------------------------
// 1. DirectionProfile — vollständiges Profil (erweitert DirectionProfileReference)
// ---------------------------------------------------------------------------

/**
 * Vollständiges Direction Profile.
 * Erweitert das Konzept von DirectionProfileReference mit vollständigen Metadaten
 * für die Variantengenerierung.
 */
export interface DirectionProfile {
  /** Eindeutige ID (z.B. "sachlich", "technisch"). */
  profileId: string;

  /** Menschenlesbares Label (z.B. "Sachlich / Neutral"). */
  label: string;

  /** Kurzbeschreibung für Tooltip/Info. */
  description: string;

  /** Kategorie für Gruppierung/Filterung. */
  category: "sachlich" | "verkaeuferisch" | "technisch" | "kreativ" | "custom";

  /** Instruction-Präfix, der dem Prompt vorangestellt wird. */
  promptPrefix: string;

  /** Constraint-Kategorien, mit denen dieses Profil kompatibel ist. */
  compatibleConstraintCategories: ConstraintCategory[];

  /** Constraint-Kategorien, die mit diesem Profil kollidieren. */
  conflictingConstraintCategories: ConstraintCategory[];

  /** Empfehlungstext: Wofür ist dieses Profil geeignet? */
  recommendation: string;
}

// ---------------------------------------------------------------------------
// 2. DirectionProfileId — vordefinierte Profil-IDs
// ---------------------------------------------------------------------------

/** Vordefinierte Profil-IDs (Union-Type für Type-Safety). */
export type DirectionProfileId =
  | "sachlich"
  | "verkaeuferisch"
  | "technisch"
  | "kurz"
  | "ausfuehrlich"
  | "kreativ"
  | "kritisch"
  | "anfaenger"
  | "experte"
  | "deep_research"
  | "agentisch"
  | "compliance"
  | "custom";

// ---------------------------------------------------------------------------
// 3. DirectionProfileSelection — Nutzer-Auswahl
// ---------------------------------------------------------------------------

/** Nutzer-Auswahl: ein oder mehrere Profile + optionaler Custom-Text. */
export interface DirectionProfileSelection {
  /** Ausgewählte Profil-IDs. */
  selectedProfileIds: DirectionProfileId[];

  /** Benutzerdefinierter Richtungstext (nur wenn "custom" ausgewählt). */
  customDirectionText?: string;
}

// ---------------------------------------------------------------------------
// 4. VariantConflict — Profil-gegen-Constraint-Konflikt (pro Variante)
// ---------------------------------------------------------------------------

/** Ein Konflikt zwischen einem Direction Profile und einem Constraint. */
export interface VariantConflict {
  /** Eindeutige ID. */
  id: string;

  /** Betroffenes Profil. */
  profileId: string;

  /** Betroffener Constraint. */
  constraint: HardConstraint;

  /** Beschreibung des Konflikts. */
  description: string;

  /** Schweregrad. */
  severity: "blocking" | "warning";

  /** Wie wurde der Konflikt behandelt? */
  resolution:
    | "constraint_preserved"
    | "profile_adjusted"
    | "manual_review"
    | "ignored";
}

// ---------------------------------------------------------------------------
// 5. PreservedConstraintReference — erhaltener Constraint in einer Variante
// ---------------------------------------------------------------------------

/** Referenz auf einen erhaltenen Constraint in einer Variante. */
export interface PreservedConstraintReference {
  /** ID des ursprünglichen Constraints. */
  constraintId: string;

  /** Text des Constraints. */
  constraintText: string;

  /** Kategorie. */
  category: ConstraintCategory;

  /** Wurde der Constraint durch das Profil beeinflusst? */
  affectedByProfile: boolean;
}

// ---------------------------------------------------------------------------
// 6. PromptVariant — einzelne generierte Variante
// ---------------------------------------------------------------------------

/** Eine einzelne generierte Prompt-Variante. */
export interface PromptVariant {
  /** Eindeutige Varianten-ID. */
  variantId: string;

  /** Referenz auf das verwendete Direction Profile. */
  profileId: string;

  /** Label der Variante (z.B. "Sachlich / Neutral"). */
  label: string;

  /** Der vollständige, generierte Varianten-Prompt. */
  content: string;

  /** Kurzbeschreibung der Zielrichtung. */
  directionExplanation: string;

  /** Welche harten Constraints wurden aus dem Original erhalten? */
  preservedConstraints: PreservedConstraintReference[];

  /** Aufgetretene Konflikte (falls vorhanden). */
  conflicts: VariantConflict[];

  /** Verwendete Annahmen (was das System ergänzt/interpretiert hat). */
  assumptions: string[];

  /** Offene Punkte / Risiken (falls vorhanden). */
  openPoints: string[];

  /** Empfehlung: Wofür ist diese Variante geeignet? */
  recommendation: string;

  /** Metadata. */
  metadata: {
    generatedAt: string;
    /** Wurde enrichedContent verwendet? */
    sourceContent: "original" | "enriched";
    appliedProfileId: string;
  };
}

// ---------------------------------------------------------------------------
// 7. VariantGenerationResult — Ergebnis einer Variantengenerierung
// ---------------------------------------------------------------------------

/** Ergebnis einer Variantengenerierung. */
export interface VariantGenerationResult {
  /** Ursprungs-Prompt (original ODER enriched). */
  sourceContent: string;

  /**
   * Fingerprint (contentFingerprint) of the sourceContent the variants were
   * generated from. Used for stale-state detection: an Apply-to-Editor is
   * refused when the current source no longer matches this fingerprint.
   */
  sourceFingerprint: string;

  /** Wurde enrichedContent verwendet? */
  enrichedContentUsed: boolean;

  /** Alle generierten Varianten. */
  variants: PromptVariant[];

  /** Aufgetretene Profil-Konflikte. */
  profileConflicts: ConstraintConflict[];

  /** Zeitstempel der Generierung. */
  appliedAt: string;
}

// ---------------------------------------------------------------------------
// 8. VariantRecommendation — Empfehlung für Variantennutzung
// ---------------------------------------------------------------------------

/** Empfehlung für die Verwendung einer Variante. */
export interface VariantRecommendation {
  /** Für welchen Einsatzzweck? */
  useCase: string;

  /** Für welche Zielgruppe? */
  targetAudience: string;

  /** Risikohinweise (falls vorhanden). */
  cautions: string[];
}
