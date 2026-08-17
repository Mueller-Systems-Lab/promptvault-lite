// =============================================================================
// PromptVault Lite — Variant Generator (#215)
// =============================================================================
// Template-based variant generation — no LLM, no network, no cloud.
// Phase 1: Prefix injection + constraint preservation.
// Phase 2/3 (later batches): constraint conflict detection + security hardening.
//
// Key invariants:
// — Original prompt content is NEVER mutated (always returns new strings).
// — Hard constraints are preserved and referenced.
// — Custom profiles handled as separate free-text code path.
// — Max 5 variants per run (owner decision Q2).
// =============================================================================

import type {
  DirectionProfile,
  DirectionProfileSelection,
  PromptVariant,
  VariantGenerationResult,
  VariantConflict,
  PreservedConstraintReference,
  HardConstraint,
} from "@/types";
import {
  extractHardConstraints,
  checkDirectionProfileConflicts,
} from "./constraintChecker";
import { getProfile, DIRECTION_PROFILES } from "./directionProfiles";
import { contentFingerprint } from "@/observability/redaction";

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_VARIANTS = 5;

// =============================================================================
// applyDirectionProfile — Prefix Injection
// =============================================================================

/**
 * Apply a Direction Profile to prompt content via template-based prefix injection.
 *
 * The profile's `promptPrefix` is prepended to the original content, acting
 * as a role/tone instruction. The original content is NEVER mutated — a new
 * string is always returned.
 *
 * @param content  The original (or enriched) prompt text.
 * @param profile  The DirectionProfile to apply.
 * @returns A new string with the profile prefix prepended.
 *          Empty/whitespace content returns "".
 *          Empty promptPrefix returns the content unchanged.
 */
export function applyDirectionProfile(
  content: string,
  profile: DirectionProfile,
): string {
  // Empty or whitespace-only content → no variant
  if (!content || content.trim().length === 0) {
    return "";
  }

  // No prompt prefix → return content as-is (e.g. custom profile with empty text)
  if (!profile.promptPrefix || profile.promptPrefix.trim().length === 0) {
    return content;
  }

  // Template: [Role/Instruction]\n\n[Original Content]
  return `${profile.promptPrefix}\n\n${content}`;
}

// =============================================================================
// generateVariants — Multi-Profile Generation
// =============================================================================

export interface GenerateVariantsOptions {
  /** Maximum number of variants to produce (default: 5). */
  maxVariants?: number;
  /** Was enriched content used as the source? */
  enrichedContentUsed?: boolean;
}

/**
 * Generate prompt variants for one or more selected direction profiles.
 *
 * Algorithm:
 * 1. Deduplicate selected profile IDs.
 * 2. Resolve profiles: predefined from directionProfiles.ts, custom from
 *    selection.customDirectionText.
 * 3. Extract hard constraints from source content.
 * 4. For each profile (up to maxVariants):
 *    a. Run checkDirectionProfileConflicts for constraint conflict detection.
 *    b. Apply profile prefix via template injection.
 *    c. Map constraints to preserved references (mark affectedByProfile).
 *    d. Build PromptVariant object with conflicts.
 * 5. Return VariantGenerationResult with all generated variants and
 *    aggregated profileConflicts.
 *
 * Constraint conflicts are detected but NEVER automatically resolved.
 * The original prompt content is NEVER mutated.
 *
 * @param sourceContent  Original or enriched prompt text.
 * @param selection      User's profile selection (IDs + optional custom text).
 * @param options        Generation options (maxVariants, enrichedContentUsed).
 * @returns VariantGenerationResult with all generated variants.
 */
export function generateVariants(
  sourceContent: string,
  selection: DirectionProfileSelection,
  options: GenerateVariantsOptions = {},
): VariantGenerationResult {
  const maxVariants = options.maxVariants ?? DEFAULT_MAX_VARIANTS;
  const enrichedContentUsed = options.enrichedContentUsed ?? false;
  const appliedAt = new Date().toISOString();

  // --- 1. Deduplicate & validate profile IDs ---
  const uniqueIds = [...new Set(selection.selectedProfileIds)];

  if (uniqueIds.length === 0) {
    return {
      sourceContent,
      sourceFingerprint: contentFingerprint(sourceContent),
      enrichedContentUsed,
      variants: [],
      profileConflicts: [],
      appliedAt,
    };
  }

  // --- 2. Extract constraints from source ---
  const constraints = extractHardConstraints(sourceContent);

  // --- 3. Collect all profile-level conflicts ---
  // We pre-compute conflicts for ALL selected profiles so that
  // profileConflicts is comprehensive, even if we stop generating
  // variants after maxVariants.
  const allProfileConflicts: import("@/types").ConstraintConflict[] = [];
  const profileConflictMap = new Map<
    string,
    import("@/types").ConstraintConflict[]
  >();

  for (const profileId of uniqueIds) {
    // Custom profiles have no predefined conflict rules
    if (profileId === "custom") {
      profileConflictMap.set(profileId, []);
      continue;
    }

    const profile = getProfile(profileId);
    if (!profile) {
      profileConflictMap.set(profileId, []);
      continue;
    }

    const conflicts = checkDirectionProfileConflicts(profile, constraints);
    profileConflictMap.set(profileId, conflicts);
    allProfileConflicts.push(...conflicts);
  }

  // --- 4. Determine which constraints are affected by profiles ---
  // A constraint is affected if ANY selected profile conflicts with it.
  const affectedCategories = new Set<string>();
  for (const conflict of allProfileConflicts) {
    affectedCategories.add(conflict.constraint.category);
  }

  // --- 5. Build preserved constraint references ---
  const preservedConstraints: PreservedConstraintReference[] = constraints.map(
    (c: HardConstraint) => ({
      constraintId: c.id,
      constraintText: c.constraintText,
      category: c.category,
      affectedByProfile: affectedCategories.has(c.category),
    }),
  );

  // --- 6. Generate variants ---
  let variantCounter = 0;
  const variants: PromptVariant[] = [];

  for (const profileId of uniqueIds) {
    if (variants.length >= maxVariants) break;

    // Handle custom profile
    if (profileId === "custom") {
      const customText = selection.customDirectionText?.trim();
      if (!customText) {
        // Custom with empty text → skip (not an error, just no-op)
        continue;
      }

      variantCounter += 1;
      const customProfile: DirectionProfile = {
        profileId: "custom",
        label: "Benutzerdefiniert",
        category: "custom",
        description: `Benutzerdefinierte Richtung: "${customText}"`,
        promptPrefix: customText,
        compatibleConstraintCategories: [],
        conflictingConstraintCategories: [],
        recommendation:
          "Benutzerdefinierte Richtung — keine automatische Constraint-Prüfung.",
      };

      const generatedContent = applyDirectionProfile(
        sourceContent,
        customProfile,
      );

      // Custom profiles: no automated constraint conflicts, but
      // constraintWarning informs the user about manual review.
      const customVariantConflicts: VariantConflict[] = constraints.map(
        (c, idx) => ({
          id: `VC_CUSTOM_${idx + 1}`,
          profileId: "custom",
          constraint: c,
          description:
            `Benutzerdefinierte Richtung: Automatische Prüfung nicht möglich. ` +
            `Constraint "${c.constraintText}" muss manuell auf Kompatibilität geprüft werden.`,
          severity: "warning" as const,
          resolution: "manual_review" as const,
        }),
      );

      const variant = mapToPromptVariant(
        generatedContent,
        customProfile,
        preservedConstraints,
        customVariantConflicts,
        enrichedContentUsed ? "enriched" : "original",
        variantCounter,
      );
      variants.push(variant);
      continue;
    }

    // Look up predefined profile
    const profile = getProfile(profileId);
    if (!profile) {
      // Unknown profile ID → skip silently
      continue;
    }

    variantCounter += 1;
    const generatedContent = applyDirectionProfile(sourceContent, profile);

    // --- Build per-variant conflicts from pre-computed profile conflicts ---
    const profileConflicts = profileConflictMap.get(profileId) || [];
    const variantConflicts: VariantConflict[] = profileConflicts.map(
      (cc, idx) => ({
        id: `VC_${profile.profileId}_${idx + 1}`,
        profileId: profile.profileId,
        constraint: cc.constraint,
        description: cc.description,
        severity: cc.severity,
        resolution: "constraint_preserved" as const,
      }),
    );

    // Build per-variant preserved constraints with individual affectedByProfile
    const variantPreservedConstraints: PreservedConstraintReference[] =
      constraints.map((c) => ({
        constraintId: c.id,
        constraintText: c.constraintText,
        category: c.category,
        affectedByProfile: profile.conflictingConstraintCategories.includes(
          c.category,
        ),
      }));

    const variant = mapToPromptVariant(
      generatedContent,
      profile,
      variantPreservedConstraints,
      variantConflicts,
      enrichedContentUsed ? "enriched" : "original",
      variantCounter,
    );
    variants.push(variant);
  }

  return {
    sourceContent,
    sourceFingerprint: contentFingerprint(sourceContent),
    enrichedContentUsed,
    variants,
    profileConflicts: allProfileConflicts,
    appliedAt,
  };
}

// =============================================================================
// mapToPromptVariant — Object Mapper
// =============================================================================

/**
 * Map raw generated content and metadata into a fully-formed PromptVariant.
 *
 * @param generatedContent      The string produced by applyDirectionProfile.
 * @param profile               The DirectionProfile that was applied.
 * @param preservedConstraints  Hard constraints preserved from the original.
 * @param conflicts             Any profile-vs-constraint conflicts (empty in Batch 2).
 * @param source                Whether enriched or original content was used.
 * @param counter               Monotonic counter for unique variant IDs.
 * @returns A complete PromptVariant object.
 */
export function mapToPromptVariant(
  generatedContent: string,
  profile: DirectionProfile,
  preservedConstraints: PreservedConstraintReference[],
  conflicts: VariantConflict[],
  source: "original" | "enriched",
  counter: number,
): PromptVariant {
  const variantId = `VAR_${profile.profileId}_${Date.now()}_${counter}`;
  const generatedAt = new Date().toISOString();

  // Edge case: empty generated content
  const isContentEmpty =
    !generatedContent || generatedContent.trim().length === 0;

  return {
    variantId,
    profileId: profile.profileId,
    label: profile.label,
    content: generatedContent || "",
    directionExplanation: profile.description,
    preservedConstraints,
    conflicts,
    assumptions: isContentEmpty
      ? ["Keine Änderung möglich — Original unverändert."]
      : [
          `Profil-Prefix "${profile.label}" wurde vorangestellt.`,
          "Keine Änderung an den Constraints des Original-Prompts.",
        ],
    openPoints: [],
    recommendation: profile.recommendation,
    metadata: {
      generatedAt,
      sourceContent: source,
      appliedProfileId: profile.profileId,
    },
  };
}

// =============================================================================
// Re-exports for convenience (profiles are the primary data source)
// =============================================================================

export { DIRECTION_PROFILES };

// =============================================================================
// System Invariants A1–A5 (Spec Section 7.5 — #215 Batch 3)
// =============================================================================
//
// These are development/test assertion functions that validate the 5 system
// invariants of the direction profiles feature. They are NOT runtime gates
// and do NOT block generation in production. They serve as documentation of
// the invariant contract and as testable assertions.
//
// Invariants:
//   A1 — Original prompt content is never mutated.
//   A2 — All hard constraints from the original are preserved.
//   A3 — No cloud/API references when offline_only constraint is present.
//   A4 — Every preserved constraint is listed in preservedConstraints[].
//   A5 — Generated variant content differs from original source content.
// =============================================================================

/**
 * CLOUD_API_KEYWORDS — patterns that suggest cloud/API usage.
 * Used by A3 to detect violations of offline_only constraints.
 */
const CLOUD_API_KEYWORDS = [
  /cloud/i,
  /online/i,
  /remote\s+(?:server|api|service)/i,
  /\bapi\s+(?:aufruf|call|endpoint|key|token)\b/i,
  /web\s*service/i,
  /\binternet\b/i,
  /\bsaas\b/i,
  /\bhttps?:\/\//i,
];

/**
 * A1 — Validate that the original prompt content was NOT mutated.
 *
 * Checks that the source content and variant content are distinct strings.
 * The variant MUST be a new string; the original is never modified.
 *
 * @param sourceContent  The original (or enriched) source content.
 * @param variantContent The generated variant content.
 * @returns `true` if the source was NOT mutated (variant is a different string).
 */
export function validateOriginalUnchanged(
  sourceContent: string,
  variantContent: string,
): boolean {
  // The variant content is always a new string in our implementation —
  // applyDirectionProfile always returns a new string or empty.
  // But the invariant is: sourceContent was not passed by reference and
  // mutated. We verify by checking the strings are different objects.
  return sourceContent !== variantContent || sourceContent === "";
}

/**
 * A2 — Validate that all hard constraints from the original are preserved
 *      in the generated variant content.
 *
 * Re-extracts constraints from the variant content and verifies that all
 * original constraint categories are still present.
 *
 * @param originalConstraints  Constraints extracted from source content.
 * @param variantConstraints   Constraints extracted from variant content.
 * @returns `true` if every original constraint category is present in variant.
 */
export function validateConstraintsPreserved(
  originalConstraints: HardConstraint[],
  variantConstraints: HardConstraint[],
): boolean {
  const originalCategories = new Set(
    originalConstraints.map((c) => c.category),
  );
  const variantCategories = new Set(variantConstraints.map((c) => c.category));

  for (const category of originalCategories) {
    if (!variantCategories.has(category)) {
      return false;
    }
  }

  return true;
}

/**
 * A3 — Validate that no cloud/API references exist when the offline_only
 *      constraint is present.
 *
 * Scans the generated content for cloud/API keywords. If an offline_only
 * constraint is active and cloud keywords are detected, the invariant is
 * violated.
 *
 * @param content               The generated variant content.
 * @param hasOfflineConstraint  Whether an offline_only constraint exists.
 * @returns `true` if no cloud references found (or no offline constraint).
 */
export function validateNoCloudReferences(
  content: string,
  hasOfflineConstraint: boolean,
): boolean {
  if (!hasOfflineConstraint) {
    return true; // No offline constraint → nothing to violate
  }

  for (const pattern of CLOUD_API_KEYWORDS) {
    if (pattern.test(content)) {
      return false;
    }
  }

  return true;
}

/**
 * A4 — Validate that every original constraint is listed in the variant's
 *      preservedConstraints[] array.
 *
 * No hard constraint must be silently removed — every one must be
 * referenced in the variant's metadata.
 *
 * @param originalConstraints  Constraints extracted from source content.
 * @param preservedRefs       PreservedConstraintReference[] from the variant.
 * @returns `true` if all original constraints are listed.
 */
export function validateConstraintsListed(
  originalConstraints: HardConstraint[],
  preservedRefs: PreservedConstraintReference[],
): boolean {
  const preservedIds = new Set(preservedRefs.map((r) => r.constraintId));

  for (const constraint of originalConstraints) {
    if (!preservedIds.has(constraint.id)) {
      return false;
    }
  }

  return true;
}

/**
 * A5 — Validate that the generated variant content differs from the
 *      original source content.
 *
 * Variants should produce new, transformed content. If the variant content
 * is identical to the source, the profile had no effect (e.g., custom
 * profile with empty text).
 *
 * @param sourceContent  The original (or enriched) source content.
 * @param variantContent The generated variant content.
 * @returns `true` if the variant content is different from the source.
 */
export function validateContentDifferent(
  sourceContent: string,
  variantContent: string,
): boolean {
  return sourceContent !== variantContent;
}
