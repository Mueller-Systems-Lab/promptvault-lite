// =============================================================================
// PromptVault Lite — Gate Content Merger Tests (Batch 2)
// =============================================================================

import { describe, it, expect } from "vitest";
import { sanitizeAnswer, mergeAnswers } from "../gateContentMerger";
import type { MissingInfoAnswer, ClassifiedMissingInfo } from "@/types";

// =============================================================================
// Helpers
// =============================================================================

function ans(itemId: string, value: string): MissingInfoAnswer {
  return { itemId, value, answeredAt: "2026-07-09T12:00:00Z" };
}

function item(
  id: string,
  label: string,
  tier: "REQUIRED" | "RECOMMENDED" | "OPTIONAL" = "REQUIRED",
): ClassifiedMissingInfo {
  return {
    id,
    source: "prompt_engineering",
    label,
    question: `Frage zu ${label}`,
    rationale: "Test-Rationale",
    inputType: "free_text",
    tier,
    classificationReason: "Test-Klassifikation",
  };
}

// =============================================================================
// sanitizeAnswer
// =============================================================================

describe("sanitizeAnswer", () => {
  // --- Markdown Heading Stripping ---

  it("strips single # heading", () => {
    expect(sanitizeAnswer("# Injected Heading")).toBe("Injected Heading");
  });

  it("strips ## heading", () => {
    expect(sanitizeAnswer("## Sub Heading")).toBe("Sub Heading");
  });

  it("strips ### heading", () => {
    expect(sanitizeAnswer("### Small Heading")).toBe("Small Heading");
  });

  it("strips ###### heading (level 6)", () => {
    expect(sanitizeAnswer("###### Deep Heading")).toBe("Deep Heading");
  });

  it("strips heading only at line start (not mid-word #)", () => {
    expect(sanitizeAnswer("Issue #42 is fixed")).toBe("Issue #42 is fixed");
  });

  it("strips headings in multi-line text", () => {
    const input = "# Top\nSome text\n## Sub\nMore text";
    const result = sanitizeAnswer(input);
    expect(result).toBe("Top\nSome text\nSub\nMore text");
  });

  // --- HTML Tag Stripping ---

  it("strips script tags", () => {
    expect(sanitizeAnswer("<script>alert(1)</script>")).toBe("alert(1)");
  });

  it("strips img tags", () => {
    expect(sanitizeAnswer('<img src="x" onerror="alert(1)">')).toBe("");
  });

  it("strips iframe tags", () => {
    expect(sanitizeAnswer('<iframe src="evil.com"></iframe>')).toBe("");
  });

  it("strips inline event handlers", () => {
    expect(sanitizeAnswer('<div onclick="steal()">Click</div>')).toBe("Click");
  });

  it("strips link tags", () => {
    expect(sanitizeAnswer('<link rel="stylesheet" href="evil.css">')).toBe("");
  });

  it("preserves text around stripped HTML tags", () => {
    expect(sanitizeAnswer("Hello <b>World</b>!")).toBe("Hello World!");
  });

  // --- Backtick Escaping ---

  it("escapes backticks", () => {
    expect(sanitizeAnswer("`code injection`")).toBe("\\`code injection\\`");
  });

  it("handles single backtick", () => {
    expect(sanitizeAnswer("Use `this` variable")).toBe(
      "Use \\`this\\` variable",
    );
  });

  it("does not double-escape already escaped backticks", () => {
    expect(sanitizeAnswer("\\`already escaped\\`")).toBe(
      "\\`already escaped\\`",
    );
  });

  it("escapes inline code blocks", () => {
    expect(sanitizeAnswer("Run `rm -rf /` to clean")).toBe(
      "Run \\`rm -rf /\\` to clean",
    );
  });

  // --- Dangerous Markdown Link Injection ---

  it("neutralizes javascript: link", () => {
    expect(sanitizeAnswer("[Click here](javascript:alert(1))")).toBe(
      "[Click here]",
    );
  });

  it("neutralizes data: link", () => {
    expect(
      sanitizeAnswer("[doc](data:text/html,<script>alert(1)</script>)"),
    ).toBe("[doc]");
  });

  it("preserves safe markdown links", () => {
    const input = "[PromptVault](https://github.com/Mueller-Systems-Lab/promptvault-lite)";
    expect(sanitizeAnswer(input)).toBe(input);
  });

  it("handles multiple dangerous links", () => {
    const input = "[a](javascript:1) normal text [b](data:2) more text";
    const result = sanitizeAnswer(input);
    expect(result).toContain("[a]");
    expect(result).toContain("[b]");
    expect(result).toContain("normal text");
    expect(result).toContain("more text");
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("data:");
  });

  // --- Control Character Normalization ---

  it("removes null bytes", () => {
    expect(sanitizeAnswer("text\u0000injected")).toBe("textinjected");
  });

  it("preserves newlines", () => {
    const input = "Line 1\nLine 2\nLine 3";
    expect(sanitizeAnswer(input)).toBe(input);
  });

  it("preserves carriage returns with newlines", () => {
    const input = "Line 1\r\nLine 2";
    const result = sanitizeAnswer(input);
    // CR (0x0D) is preserved, so \r\n should remain
    expect(result).toBe(input);
  });

  it("preserves tabs", () => {
    expect(sanitizeAnswer("col1\tcol2")).toBe("col1\tcol2");
  });

  it("removes other control characters (0x01-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F)", () => {
    // BEL (0x07), VT (0x0B), and DEL (0x7F) between chars a b c d
    const input = "a\u0007b\u000bc\u007fd";
    // 0x07 removed, 0x0B removed, 0x7F removed → "abcd"
    expect(sanitizeAnswer(input)).toBe("abcd");
  });

  // --- Trim ---

  it("trims leading whitespace", () => {
    expect(sanitizeAnswer("   text")).toBe("text");
  });

  it("trims trailing whitespace", () => {
    expect(sanitizeAnswer("text   ")).toBe("text");
  });

  it("trims both sides", () => {
    expect(sanitizeAnswer("  text  ")).toBe("text");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(sanitizeAnswer("   \n  \t  ")).toBe("");
  });

  // --- Collapse Blank Lines ---

  it("collapses multiple blank lines into one", () => {
    const input = "A\n\n\n\nB";
    const result = sanitizeAnswer(input);
    expect(result).toBe("A\n\nB");
  });

  it("preserves single blank lines", () => {
    const input = "A\n\nB";
    expect(sanitizeAnswer(input)).toBe("A\n\nB");
  });

  // --- Length Limitation ---

  it("truncates answers longer than 5000 characters", () => {
    const long = "x".repeat(6000);
    const result = sanitizeAnswer(long);
    expect(result.length).toBe(5001); // 5000 + "…"
    expect(result.endsWith("…")).toBe(true);
  });

  it("does not truncate short answers", () => {
    const short = "Short answer";
    expect(sanitizeAnswer(short)).toBe(short);
  });

  it("handles exactly 5000 characters", () => {
    const exact = "x".repeat(5000);
    const result = sanitizeAnswer(exact);
    expect(result.length).toBe(5000);
    expect(result.endsWith("…")).toBe(false);
  });

  // --- German Umlauts Preservation ---

  it("preserves German umlauts: äöü", () => {
    expect(sanitizeAnswer("für die Tür")).toBe("für die Tür");
  });

  it("preserves German umlauts: ÄÖÜ", () => {
    expect(sanitizeAnswer("Änderungen Öffentlich Über")).toBe(
      "Änderungen Öffentlich Über",
    );
  });

  it("preserves ß (eszett)", () => {
    expect(sanitizeAnswer("Straße Groß")).toBe("Straße Groß");
  });

  it("preserves German text with punctuation", () => {
    const input = "Zielgruppe: Ärzte, Anwälte und Öffentlicher Dienst.";
    expect(sanitizeAnswer(input)).toBe(input);
  });

  it("preserves technical terms with special chars", () => {
    const input = "Use C++17, Node.js v20.x, and TypeScript 5.x.";
    expect(sanitizeAnswer(input)).toBe(input);
  });

  // --- Edge Cases ---

  it("returns empty string for null-like input", () => {
    expect(sanitizeAnswer("")).toBe("");
  });

  it("handles complex multi-vector input", () => {
    const input =
      "# Heading\n<script>alert(1)</script>\nNormal text\n`code`\n[evil](javascript:x)\näöü\n\u0000null";
    const result = sanitizeAnswer(input);
    expect(result).toContain("Normal text");
    expect(result).toContain("äöü");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("# Heading");
    expect(result).not.toContain("\u0000");
    expect(result).toContain("\\`code\\`");
    expect(result).toContain("[evil]");
  });

  // --- Security: No Silent Constraint Removal ---

  it("preserves constraint-like text in answers", () => {
    // Sanitization should NOT remove security-related content;
    // constraint enforcement is done by constraintChecker, not sanitizer.
    const constraintText = "Keine Cloud verwenden, local-only ausführen";
    expect(sanitizeAnswer(constraintText)).toBe(constraintText);
  });
});

// =============================================================================
// mergeAnswers
// =============================================================================

describe("mergeAnswers", () => {
  const ORIGINAL = "Dies ist der Original-Prompt.\nEr enthält mehrere Zeilen.";

  // --- SKIPPED Outcome ---

  it("returns original content unchanged for SKIPPED outcome", () => {
    const result = mergeAnswers(ORIGINAL, [], [], "SKIPPED");
    expect(result.enrichedContent).toBe(ORIGINAL);
    expect(result.answeredCount).toBe(0);
    expect(result.assumedCount).toBe(0);
  });

  it("returns original unchanged even with answers for SKIPPED outcome", () => {
    const items = [item("1", "Zieldefinition")];
    const answers = [ans("1", "Ein Ziel")];
    const result = mergeAnswers(ORIGINAL, answers, items, "SKIPPED");
    expect(result.enrichedContent).toBe(ORIGINAL);
  });

  // --- COMPLETED Outcome ---

  it("appends answer section for COMPLETED outcome", () => {
    const items = [item("1", "Zieldefinition")];
    const answers = [ans("1", "Ein Prompt-Tool bauen")];
    const result = mergeAnswers(ORIGINAL, answers, items, "COMPLETED");

    expect(result.enrichedContent).toContain(ORIGINAL);
    expect(result.enrichedContent).toContain(
      "## Ergänzte Informationen (Missing-Info-Gate)",
    );
    expect(result.enrichedContent).toContain(
      "- **Zieldefinition:** Ein Prompt-Tool bauen",
    );
    expect(result.answeredCount).toBe(1);
    expect(result.assumedCount).toBe(0);
  });

  it("original content comes before the answer section", () => {
    const items = [item("1", "Frage")];
    const answers = [ans("1", "Antwort")];
    const result = mergeAnswers(ORIGINAL, answers, items, "COMPLETED");

    const origIndex = result.enrichedContent.indexOf(ORIGINAL);
    const sectionIndex = result.enrichedContent.indexOf("## Ergänzte");
    expect(origIndex).toBeLessThan(sectionIndex);
  });

  it("marks skipped items for COMPLETED outcome", () => {
    const items = [item("1", "Beantwortet"), item("2", "Übersprungen")];
    const answers = [ans("1", "Antwort")];

    const result = mergeAnswers(ORIGINAL, answers, items, "COMPLETED", {
      skippedItemIds: new Set(["2"]),
    });

    expect(result.enrichedContent).toContain("- **Beantwortet:** Antwort");
    expect(result.enrichedContent).toContain(
      "- **Übersprungen:** *übersprungen*",
    );
    expect(result.answeredCount).toBe(1);
    expect(result.skippedCount).toBe(1);
  });

  it("omits items without answer and without skip flag", () => {
    const items = [item("1", "Beantwortet"), item("2", "Nicht interagiert")];
    const answers = [ans("1", "Antwort")];

    const result = mergeAnswers(ORIGINAL, answers, items, "COMPLETED");

    expect(result.enrichedContent).toContain("Beantwortet");
    expect(result.enrichedContent).not.toContain("Nicht interagiert");
    expect(result.answeredCount).toBe(1);
  });

  // --- ASSUMPTIONS Outcome ---

  it("marks answers as Annahme for ASSUMPTIONS outcome", () => {
    const items = [item("1", "Zieldefinition")];
    const answers = [ans("1", "Generische Optimierung")];

    const result = mergeAnswers(ORIGINAL, answers, items, "ASSUMPTIONS");

    expect(result.enrichedContent).toContain(
      "- **Zieldefinition:** Generische Optimierung _(Annahme)_",
    );
    expect(result.answeredCount).toBe(1);
    expect(result.assumedCount).toBe(1);
  });

  it("assumedCount equals answeredCount for ASSUMPTIONS", () => {
    const items = [item("1", "A"), item("2", "B"), item("3", "C")];
    const answers = [ans("1", "x"), ans("2", "y"), ans("3", "z")];

    const result = mergeAnswers(ORIGINAL, answers, items, "ASSUMPTIONS");

    expect(result.answeredCount).toBe(3);
    expect(result.assumedCount).toBe(3);
    expect(result.assumedCount).toBe(result.answeredCount);
  });

  // --- Empty Answers ---

  it("skips empty answer values", () => {
    const items = [item("1", "A"), item("2", "B")];
    const answers = [ans("1", ""), ans("2", "   ")];

    const result = mergeAnswers(ORIGINAL, answers, items, "COMPLETED");

    // No answers to merge → should return original unchanged
    // (empty/whitespace values are filtered out)
    expect(result.answeredCount).toBe(0);
  });

  it("skips whitespace-only answers", () => {
    const items = [item("1", "Frage")];
    const answers = [ans("1", "   \n  ")];

    const result = mergeAnswers(ORIGINAL, answers, items, "COMPLETED");
    expect(result.answeredCount).toBe(0);
  });

  // --- Multiple Items ---

  it("merges multiple answers in item order", () => {
    const items = [
      item("1", "Zieldefinition"),
      item("2", "Ausgabeformat"),
      item("3", "Zielgruppe"),
    ];
    const answers = [
      ans("1", "Tool bauen"),
      ans("2", "JSON"),
      ans("3", "Entwickler"),
    ];

    const result = mergeAnswers(ORIGINAL, answers, items, "COMPLETED");

    expect(result.answeredCount).toBe(3);
    expect(result.enrichedContent).toContain("Zieldefinition");
    expect(result.enrichedContent).toContain("Ausgabeformat");
    expect(result.enrichedContent).toContain("Zielgruppe");

    // Order check: Zieldefinition should appear before Ausgabeformat
    const zi = result.enrichedContent.indexOf("Zieldefinition");
    const af = result.enrichedContent.indexOf("Ausgabeformat");
    expect(zi).toBeLessThan(af);
  });

  // --- Sanitization in Merge ---

  it("sanitizes answers during merge", () => {
    const items = [item("1", "Frage")];
    const answers = [ans("1", "<script>alert(1)</script> Antwort")];

    const result = mergeAnswers(ORIGINAL, answers, items, "COMPLETED");

    expect(result.enrichedContent).not.toContain("<script>");
    expect(result.enrichedContent).toContain("alert(1) Antwort");
  });

  // --- Original Content Preservation ---

  it("original content is never mutated", () => {
    const original = "Unveränderter Prompt";
    const items = [item("1", "Frage")];
    const answers = [ans("1", "Antwort")];

    const result = mergeAnswers(original, answers, items, "COMPLETED");

    expect(result.enrichedContent).toContain(original);
    expect(original).toBe("Unveränderter Prompt"); // original string unchanged
  });

  it("enriched content ends with section, not replaces original", () => {
    const original = "ORIGINAL_START\nMitte\nORIGINAL_END";
    const items = [item("1", "Frage")];
    const answers = [ans("1", "Antwort")];

    const result = mergeAnswers(original, answers, items, "COMPLETED");

    expect(result.enrichedContent.startsWith(original.trimEnd())).toBe(true);
    expect(result.enrichedContent).toContain("ORIGINAL_START");
    expect(result.enrichedContent).toContain("ORIGINAL_END");
  });

  // --- hasConflicts Flag ---

  it("propagates hasConflicts flag", () => {
    const result = mergeAnswers(ORIGINAL, [], [], "SKIPPED", {
      hasConflicts: true,
    });
    expect(result.hasConflicts).toBe(true);
  });

  it("defaults hasConflicts to false", () => {
    const result = mergeAnswers(ORIGINAL, [], [], "SKIPPED");
    expect(result.hasConflicts).toBe(false);
  });

  // --- Deterministic Output ---

  it("produces identical output for identical inputs", () => {
    const items = [item("1", "Frage")];
    const answers = [ans("1", "Antwort")];

    const result1 = mergeAnswers(ORIGINAL, answers, items, "COMPLETED");
    const result2 = mergeAnswers(ORIGINAL, answers, items, "COMPLETED");

    expect(result1.enrichedContent).toBe(result2.enrichedContent);
    expect(result1.answeredCount).toBe(result2.answeredCount);
  });

  // --- Edge Cases ---

  it("handles empty items array", () => {
    const result = mergeAnswers(ORIGINAL, [], [], "COMPLETED");
    expect(result.enrichedContent).toBe(ORIGINAL);
    expect(result.answeredCount).toBe(0);
  });

  it("handles items with no matching answers", () => {
    const items = [item("1", "Unbeantwortet")];
    const answers: MissingInfoAnswer[] = [];

    const result = mergeAnswers(ORIGINAL, answers, items, "COMPLETED");

    expect(result.enrichedContent).toBe(ORIGINAL);
    expect(result.answeredCount).toBe(0);
  });

  it("handles answers with IDs not in items", () => {
    const items = [item("1", "Frage")];
    const answers = [ans("999", "Orphan answer")];

    const result = mergeAnswers(ORIGINAL, answers, items, "COMPLETED");
    expect(result.answeredCount).toBe(0);
  });

  it("handles mixed answered/skipped/uninteracted", () => {
    const items = [
      item("1", "Beantwortet"),
      item("2", "Übersprungen"),
      item("3", "Nie gesehen"),
    ];
    const answers = [ans("1", "Ja")];

    const result = mergeAnswers(ORIGINAL, answers, items, "COMPLETED", {
      skippedItemIds: new Set(["2"]),
    });

    expect(result.answeredCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.enrichedContent).toContain("Beantwortet");
    expect(result.enrichedContent).toContain("Übersprungen");
    expect(result.enrichedContent).not.toContain("Nie gesehen");
  });

  // --- Markdown Format Validation ---

  it("produces valid Markdown: heading starts with ##", () => {
    const items = [item("1", "Frage")];
    const answers = [ans("1", "Antwort")];

    const result = mergeAnswers(ORIGINAL, answers, items, "COMPLETED");

    const lines = result.enrichedContent.split("\n");
    const headingLine = lines.find((l) => l.startsWith("## Ergänzte"));
    expect(headingLine).toBeDefined();
    expect(headingLine).toBe("## Ergänzte Informationen (Missing-Info-Gate)");
  });

  it("produces valid Markdown: answers as bullet points", () => {
    const items = [item("1", "Frage A"), item("2", "Frage B")];
    const answers = [ans("1", "Antwort A"), ans("2", "Antwort B")];

    const result = mergeAnswers(ORIGINAL, answers, items, "COMPLETED");

    const lines = result.enrichedContent.split("\n");
    const bulletLines = lines.filter((l) => l.startsWith("- **"));
    expect(bulletLines.length).toBe(2);
    expect(bulletLines[0]).toMatch(/^- \*\*Frage A:\*\* .+/);
    expect(bulletLines[1]).toMatch(/^- \*\*Frage B:\*\* .+/);
  });
});
