import { describe, expect, it, vi } from "vitest";
import type { PromptEvaluation, PromptHygiene, PromptItem } from "@/types";
import {
  buildWebExportContent,
  buildWebExportDocument,
  saveWebExportFile,
} from "../webExport";

const prompt: PromptItem = {
  id: "synthetic-1",
  file_path: "/tmp/test-vault/synthetic.md",
  file_name: "synthetic.md",
  title: "Synthetic title",
  description: "Synthetic description",
  category: "test",
  version: "1.0",
  tags: ["safe"],
  content: "Synthetic prompt content",
  raw_frontmatter: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  is_favorite: true,
};

const evaluation: PromptEvaluation = {
  id: "evaluation-1",
  prompt_id: prompt.id,
  overall_score: 82,
  criteria: [],
  missing_sections: [],
  recommendations: [],
  evaluated_at: "2026-01-01T00:00:00Z",
};

const hygiene: PromptHygiene = {
  id: "hygiene-1",
  prompt_id: prompt.id,
  hygiene_score: 96,
  status: "clean",
  artifacts: [],
  analyzed_at: "2026-01-01T00:00:00Z",
};

describe("web export", () => {
  it("builds JSON and Markdown with the selected prompt and analysis scores", () => {
    const document = buildWebExportDocument(
      [prompt],
      { [prompt.id]: evaluation },
      { [prompt.id]: hygiene },
      "2026-01-02T03:04:05.000Z",
    );

    const json = buildWebExportContent("json", document);
    expect(json.filename).toBe("promptvault-export-2026-01-02T03-04-05-000Z.json");
    expect(JSON.parse(json.content)).toMatchObject({
      export_date: "2026-01-02T03:04:05.000Z",
      version: __APP_VERSION__,
      prompts: [{ id: prompt.id, quality_score: 82, hygiene_score: 96 }],
    });

    const markdown = buildWebExportContent("markdown", document);
    expect(markdown.mimeType).toContain("text/markdown");
    expect(markdown.content).toContain('title: "Synthetic title"');
    expect(markdown.content).toContain('created_at: "2026-01-01T00:00:00Z"');
    expect(markdown.content).toContain('updated_at: "2026-01-01T00:00:00Z"');
    expect(markdown.content).toContain("# quality_score: 82");
    expect(markdown.content).toContain("# hygiene_score: 96");
    expect(markdown.content).toContain(prompt.content);
  });

  it("writes through the browser save picker and closes the stream", async () => {
    const write = vi.fn((blob: Blob) => {
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("application/json");
      expect(blob.size).toBe(11);
      return Promise.resolve();
    });
    const close = vi.fn(() => Promise.resolve());
    const picker = vi.fn(() =>
      Promise.resolve({
        createWritable: () => Promise.resolve({ write, close }),
      })
    );

    await saveWebExportFile(
      {
        filename: "promptvault-export.json",
        mimeType: "application/json",
        content: '{"ok":true}',
      },
      picker,
    );

    expect(picker).toHaveBeenCalledWith({
      suggestedName: "promptvault-export.json",
      types: [
        {
          description: "PromptVault export",
          accept: { "application/json": [".json"] },
        },
      ],
    });
    expect(write).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("calls the browser save picker with window as its receiver", async () => {
    const original = Object.getOwnPropertyDescriptor(window, "showSaveFilePicker");
    const write = vi.fn(() => Promise.resolve());
    const close = vi.fn(() => Promise.resolve());
    const picker = vi.fn(function (this: Window) {
      expect(this).toBe(window);
      return Promise.resolve({
        createWritable: () => Promise.resolve({ write, close }),
      });
    });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: picker,
    });

    try {
      await saveWebExportFile({
        filename: "promptvault-export.json",
        mimeType: "application/json",
        content: '{"ok":true}',
      });
      expect(picker).toHaveBeenCalledOnce();
    } finally {
      if (original) Object.defineProperty(window, "showSaveFilePicker", original);
      else Reflect.deleteProperty(window, "showSaveFilePicker");
    }
  });
});
