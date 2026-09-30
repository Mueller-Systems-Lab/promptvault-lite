// =============================================================================
// Recommendation Blocks — Mapping Tests (Issue #45)
// =============================================================================
// Red tests: rule-based mapping from analysis recommendations to editable
// text blocks. Written BEFORE implementation (TDD contract of the repo).
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  mapRecommendationToBlock,
  buildRecommendationBlocks,
  buildPreviewContent,
} from "@/lib/recommendationBlocks";

describe("mapRecommendationToBlock", () => {
  it("maps Secret recommendations to a Sicherheit block", () => {
    const b = mapRecommendationToBlock(
      "KRITISCH: Entferne das Secret »abc« sofort!",
      0,
    );
    expect(b.heading).toBe("## Sicherheit");
    expect(b.sourceRecommendation).toContain("Secret");
    expect(b.id).toBe("rec-block-0");
  });

  it("maps Datenschutz/Pii recommendations to a Datenschutz block", () => {
    const b = mapRecommendationToBlock(
      "Datenschutz: Ersetze »Max« durch einen Platzhalter.",
      1,
    );
    expect(b.heading).toBe("## Datenschutz");
  });

  it("maps Ziel recommendations to a Ziel block", () => {
    const b = mapRecommendationToBlock("Definiere ein klares Ziel.", 2);
    expect(b.heading).toBe("## Ziel");
  });

  it("maps Rolle recommendations to a Rolle block", () => {
    const b = mapRecommendationToBlock("Beschreibe die Rolle des Agenten.", 0);
    expect(b.heading).toBe("## Rolle");
  });

  it("maps Kontext recommendations to a Kontext block", () => {
    const b = mapRecommendationToBlock("Ergänze Kontext für die Aufgabe.", 0);
    expect(b.heading).toBe("## Kontext");
  });

  it("maps Ausgabeformat/Output recommendations to an Ausgabeformat block", () => {
    expect(
      mapRecommendationToBlock("Lege das Ausgabeformat fest.", 0).heading,
    ).toBe("## Ausgabeformat");
    expect(
      mapRecommendationToBlock("Define the output format.", 1).heading,
    ).toBe("## Ausgabeformat");
  });

  it("maps Anforderung recommendations to an Anforderungen block", () => {
    expect(
      mapRecommendationToBlock("Formuliere Anforderungen als Regeln.", 0)
        .heading,
    ).toBe("## Anforderungen");
  });

  it("maps Constraint/Grenzen recommendations to a Constraints block", () => {
    expect(
      mapRecommendationToBlock("Definiere explizite Constraints/Grenzen.", 0)
        .heading,
    ).toBe("## Constraints");
  });

  it("falls back to a numbered Ergänzung block for unknown recommendations", () => {
    const b = mapRecommendationToBlock("Irgendein unbekannter Vorschlag.", 4);
    expect(b.heading).toBe("## Ergänzung 5");
    expect(b.text).toContain("Irgendein unbekannter Vorschlag.");
  });

  it("is deterministic (same input → same output)", () => {
    const a = mapRecommendationToBlock("Definiere ein klares Ziel.", 0);
    const b = mapRecommendationToBlock("Definiere ein klares Ziel.", 0);
    expect(a).toEqual(b);
  });

  it("embeds the recommendation as guidance comment in the editable text", () => {
    const b = mapRecommendationToBlock("Ergänze Kontext für die Aufgabe.", 0);
    expect(b.text).toContain("<!-- Empfehlung:");
    expect(b.text).toContain("Ergänze Kontext für die Aufgabe.");
    expect(b.text.length).toBeGreaterThan(b.sourceRecommendation.length);
  });
});

describe("buildRecommendationBlocks", () => {
  it("builds one block per recommendation with stable ids", () => {
    const blocks = buildRecommendationBlocks([
      "Definiere ein klares Ziel.",
      "Ergänze Kontext für die Aufgabe.",
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].id).toBe("rec-block-0");
    expect(blocks[1].id).toBe("rec-block-1");
  });

  it("returns empty array for empty input", () => {
    expect(buildRecommendationBlocks([])).toEqual([]);
  });
});

describe("buildPreviewContent", () => {
  it("appends blocks after the original content separated by blank lines", () => {
    const blocks = buildRecommendationBlocks(["Definiere ein klares Ziel."]);
    const preview = buildPreviewContent("Original", blocks);
    expect(preview.startsWith("Original")).toBe(true);
    expect(preview).toContain("## Ziel");
  });

  it("returns the original content when no blocks exist", () => {
    expect(buildPreviewContent("Original", [])).toBe("Original");
  });

  it("orders multiple blocks in selection order", () => {
    const blocks = [
      { id: "a", sourceRecommendation: "x", heading: "## B", text: "## B\n\nb" },
      { id: "b", sourceRecommendation: "y", heading: "## A", text: "## A\n\na" },
    ];
    const preview = buildPreviewContent("O", blocks);
    const iB = preview.indexOf("## B");
    const iA = preview.indexOf("## A");
    expect(iB).toBeGreaterThan(-1);
    expect(iA).toBeGreaterThan(iB);
  });
});
