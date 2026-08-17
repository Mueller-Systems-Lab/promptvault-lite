// =============================================================================
// PromptVault Lite — Advanced Workflows Availability (GA) Tests
// =============================================================================
// GA contract (spec §26/§27):
//   - Missing Info (#216) and Direction/Variants (#215) are GA.
//   - Production builds are ALWAYS available — a release pipeline injecting
//     PROMPTVAULT_MISSING_INFO_GATE=0/false can never disable them.
//   - In dev (vitest / vite dev) the default is available; ONLY an explicit
//     "0"/"false" value acts as a troubleshooting override to disable.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  isMissingInfoAvailable,
  isDirectionAvailable,
  resolveMissingInfoAvailability,
  resolveDirectionAvailability,
} from "../advancedWorkflowsAvailability";

describe("advancedWorkflowsAvailability", () => {
  it("isMissingInfoAvailable({}) === true (no env)", () => {
    expect(isMissingInfoAvailable({})).toBe(true);
  });

  it("isDirectionAvailable({}) === true (no env)", () => {
    expect(isDirectionAvailable({})).toBe(true);
  });

  it("isMissingInfoAvailable(undefined) === true (no env at all)", () => {
    expect(isMissingInfoAvailable(undefined)).toBe(true);
  });

  it("dev default is available; only an explicit false disables in dev", () => {
    // In the vitest/dev environment import.meta.env.PROD === false, so an
    // explicit "0"/"false" is the dev-only troubleshooting override.
    expect(
      isMissingInfoAvailable({ PROMPTVAULT_MISSING_INFO_GATE: "0" }),
    ).toBe(false);
    expect(
      isMissingInfoAvailable({ PROMPTVAULT_MISSING_INFO_GATE: "false" }),
    ).toBe(false);
    // Any other value stays available in dev.
    expect(
      isMissingInfoAvailable({ PROMPTVAULT_MISSING_INFO_GATE: "1" }),
    ).toBe(true);
  });

  it("resolveMissingInfoAvailability({0}, true) === true — production build cannot be disabled (spec §26 test 5)", () => {
    expect(
      resolveMissingInfoAvailability({ PROMPTVAULT_MISSING_INFO_GATE: "0" }, true),
    ).toBe(true);
  });

  it("resolveDirectionAvailability({false}, true) === true — production build cannot be disabled (§27 regression)", () => {
    expect(
      resolveDirectionAvailability({ PROMPTVAULT_DIRECTION_PROFILES: "false" }, true),
    ).toBe(true);
  });

  it("resolveMissingInfoAvailability(undefined, false) === true", () => {
    expect(resolveMissingInfoAvailability(undefined, false)).toBe(true);
  });

  it("dev-only disable: resolveMissingInfoAvailability({0}, false) === false (troubleshooting override in dev only)", () => {
    expect(
      resolveMissingInfoAvailability({ PROMPTVAULT_MISSING_INFO_GATE: "0" }, false),
    ).toBe(false);
  });

  it("production contract: neither feature can ever be disabled by env in production", () => {
    const envFalse = {
      PROMPTVAULT_MISSING_INFO_GATE: "0",
      PROMPTVAULT_DIRECTION_PROFILES: "false",
    };
    expect(resolveMissingInfoAvailability(envFalse, true)).toBe(true);
    expect(resolveDirectionAvailability(envFalse, true)).toBe(true);
  });
});
