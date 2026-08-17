// =============================================================================
// PromptVault Lite — Advanced Workflows Availability (GA)
// =============================================================================
// Missing Info (#216) and Direction/Variants (#215) are GA since v1.11.0.
//
// GA contract (spec §26/§27):
//   - Production builds are ALWAYS available. A release pipeline injecting
//     PROMPTVAULT_MISSING_INFO_GATE=0/false or
//     PROMPTVAULT_DIRECTION_PROFILES=0/false can NEVER disable them.
//   - In dev (vitest / vite dev), an explicit "0"/"false" acts as a
//     troubleshooting override to disable the feature.
//   - The default (no env) is always available in every environment.
// =============================================================================

// ---------------------------------------------------------------------------
// Pure resolvers (testable, environment-agnostic)
// ---------------------------------------------------------------------------

/**
 * Resolve Missing-Info availability for a given environment and production flag.
 *
 * @param env          Optional environment record (e.g. `process.env`).
 * @param isProduction Whether the current build is a production build
 *                     (`import.meta.env.PROD === true`).
 * @returns `true` when the feature is available.
 */
export function resolveMissingInfoAvailability(
  env: Record<string, string | undefined> | undefined,
  isProduction: boolean,
): boolean {
  // GA contract: production builds are ALWAYS available; a release pipeline
  // injecting PROMPTVAULT_MISSING_INFO_GATE=0/false can never disable it.
  if (isProduction) return true;
  const raw = env?.["PROMPTVAULT_MISSING_INFO_GATE"];
  return !(raw === "0" || raw === "false");
}

/**
 * Resolve Direction/Variants availability for a given environment and
 * production flag. Same GA contract as resolveMissingInfoAvailability.
 */
export function resolveDirectionAvailability(
  env: Record<string, string | undefined> | undefined,
  isProduction: boolean,
): boolean {
  if (isProduction) return true;
  const raw = env?.["PROMPTVAULT_DIRECTION_PROFILES"];
  return !(raw === "0" || raw === "false");
}

// ---------------------------------------------------------------------------
// Environment-aware wrappers
// ---------------------------------------------------------------------------

/**
 * Whether the Missing-Info-Gate is available in the current build.
 * In vitest `import.meta.env.PROD` is false and `DEV` is true; in
 * `vite build`/`tauri build` (production) `PROD` is true. This gives a
 * genuine dev-only troubleshooting override that can never affect a
 * production build.
 */
export function isMissingInfoAvailable(
  env?: Record<string, string | undefined>,
): boolean {
  return resolveMissingInfoAvailability(env, import.meta.env.PROD);
}

/** Whether Direction Profiles / Variant generation is available. */
export function isDirectionAvailable(
  env?: Record<string, string | undefined>,
): boolean {
  return resolveDirectionAvailability(env, import.meta.env.PROD);
}
