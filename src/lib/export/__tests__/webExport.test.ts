import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PromptEvaluation, PromptHygiene, PromptItem } from "@/types";
import {
  ExportFailureError,
  buildWebExportContent,
  buildWebExportDocument,
  isExportCancellation,
  saveWebExportFile,
} from "../webExport";
import type { WebExportDocument } from "../webExport";

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

// Failing export stages log the raw exception text for diagnosis; silence it
// here and assert on it where relevant.
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  consoleErrorSpy.mockRestore();
});

const WRITE_MESSAGE =
  "Die Exportdatei konnte nicht geschrieben werden. Bitte freien Speicherplatz prüfen und erneut versuchen.";
const DESTINATION_MESSAGE =
  "Der Speicherort konnte nicht ausgewählt oder angelegt werden. Bitte einen anderen Ordner wählen.";
const FINALIZE_MESSAGE =
  "Die Exportdatei konnte nicht abgeschlossen werden. Bitte erneut versuchen.";

describe("web export", () => {
  it("builds JSON and Markdown with the selected prompt and analysis scores", () => {
    const document = buildWebExportDocument(
      [prompt],
      { [prompt.id]: evaluation },
      { [prompt.id]: hygiene },
      "2026-01-02T03:04:05.000Z",
    );

    const json = buildWebExportContent("json", document);
    expect(json.filename).toBe(
      "promptvault-export-2026-01-02T03-04-05-000Z.json",
    );
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

  it("uses null for missing analysis and uncategorized for missing or blank categories", () => {
    const document = buildWebExportDocument(
      [
        { ...prompt, category: undefined },
        { ...prompt, id: "blank", category: "  " },
      ],
      {},
      {},
      "2026-01-02T03:04:05.000Z",
    );
    const json = JSON.parse(
      buildWebExportContent("json", document).content,
    ) as WebExportDocument;
    const markdown = buildWebExportContent("markdown", document);

    expect(json.prompts).toHaveLength(2);
    for (const entry of json.prompts) {
      expect(entry).toMatchObject({
        category: "uncategorized",
        quality_score: null,
        hygiene_score: null,
      });
    }
    expect(markdown.content).toContain('category: "uncategorized"');
    expect(markdown.content).toContain("# quality_score: null");
    expect(markdown.content).toContain("# hygiene_score: null");
  });

  it("retains an actual score of zero", () => {
    const document = buildWebExportDocument(
      [prompt],
      { [prompt.id]: { ...evaluation, overall_score: 0 } },
      { [prompt.id]: { ...hygiene, hygiene_score: 0 } },
    );
    const json = JSON.parse(
      buildWebExportContent("json", document).content,
    ) as WebExportDocument;
    const markdown = buildWebExportContent("markdown", document);

    expect(json.prompts[0].quality_score).toBe(0);
    expect(json.prompts[0].hygiene_score).toBe(0);
    expect(markdown.content).toContain("# quality_score: 0");
    expect(markdown.content).toContain("# hygiene_score: 0");
  });

  it("writes separate Markdown blocks for multiple prompts with Unicode content", () => {
    const secondPrompt = {
      ...prompt,
      id: "synthetic-2",
      title: "Grüße 🌍",
      content: "Zweite Zeile: café 🚀",
      tags: [],
    };
    const document = buildWebExportDocument(
      [prompt, secondPrompt],
      {},
      {},
      "2026-01-02T03:04:05.000Z",
    );
    const markdown = buildWebExportContent("markdown", document);
    const blocks = markdown.content.split("\n\n---\n\n");

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatch(/^---\ntitle: "Synthetic title"/);
    expect(blocks[0]).toContain(prompt.content);
    expect(blocks[1]).toMatch(/^---\ntitle: "Grüße 🌍"/);
    expect(blocks[1]).toContain("tags: []");
    expect(blocks[1]).toContain(secondPrompt.content);
    expect(
      (
        JSON.parse(
          buildWebExportContent("json", document).content,
        ) as WebExportDocument
      ).prompts[1].title,
    ).toBe("Grüße 🌍");
  });

  it("serializes more than 1000 selected prompts", () => {
    const prompts = Array.from({ length: 1001 }, (_, index) => ({
      ...prompt,
      id: `synthetic-${index}`,
      content: `Content ${index}`,
    }));
    const document = buildWebExportDocument(prompts, {}, {});
    const json = JSON.parse(
      buildWebExportContent("json", document).content,
    ) as WebExportDocument;

    expect(json.prompts).toHaveLength(1001);
    expect(json.prompts[1000]).toMatchObject({
      id: "synthetic-1000",
      content: "Content 1000",
    });
  });

  it("writes through the browser save picker and closes the stream", async () => {
    const write = vi.fn((blob: Blob) => {
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("application/json");
      expect(blob.size).toBe(11);
      return Promise.resolve();
    });
    const close = vi.fn(() => Promise.resolve());
    const abort = vi.fn(() => Promise.resolve());
    const picker = vi.fn(() =>
      Promise.resolve({
        createWritable: () => Promise.resolve({ write, close, abort }),
      }),
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
    expect(abort).not.toHaveBeenCalled();
  });

  it("aborts a failed write without committing a partial file", async () => {
    const writeError = new Error("Write failed");
    const write = vi.fn(() => Promise.reject(writeError));
    const abort = vi.fn(() => Promise.resolve());
    const close = vi.fn(() => Promise.resolve());
    const picker = vi.fn(() =>
      Promise.resolve({
        createWritable: () => Promise.resolve({ write, abort, close }),
      }),
    );

    const error = (await saveWebExportFile(
      {
        filename: "promptvault-export.json",
        mimeType: "application/json",
        content: '{"ok":true}',
      },
      picker,
    ).catch((e: unknown) => e)) as ExportFailureError;

    expect(error).toBeInstanceOf(ExportFailureError);
    expect(error.stage).toBe("write");
    expect(error.message).toBe(WRITE_MESSAGE);
    expect(error.technicalDetail).toContain("Write failed");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[export] write failure: Write failed"),
    );
    expect(abort).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
  });

  it("reports close failures as a German finalize error", async () => {
    const write = vi.fn(() => Promise.resolve());
    const close = vi.fn(() => Promise.reject(new Error("Close failed")));
    const abort = vi.fn(() => Promise.resolve());
    const picker = vi.fn(() =>
      Promise.resolve({
        createWritable: () => Promise.resolve({ write, close, abort }),
      }),
    );

    const error = (await saveWebExportFile(
      {
        filename: "promptvault-export.json",
        mimeType: "application/json",
        content: "{}",
      },
      picker,
    ).catch((e: unknown) => e)) as ExportFailureError;

    expect(error).toBeInstanceOf(ExportFailureError);
    expect(error.stage).toBe("finalize");
    expect(error.message).toBe(FINALIZE_MESSAGE);
    expect(error.technicalDetail).toContain("Close failed");
    expect(write).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(abort).toHaveBeenCalledOnce();
  });

  it("preserves a close failure when abort also fails", async () => {
    const write = vi.fn(() => Promise.resolve());
    const close = vi.fn(() => Promise.reject(new Error("Close failed")));
    const abort = vi.fn(() => Promise.reject(new Error("Abort failed")));
    const picker = vi.fn(() =>
      Promise.resolve({
        createWritable: () => Promise.resolve({ write, close, abort }),
      }),
    );

    const error = (await saveWebExportFile(
      {
        filename: "promptvault-export.json",
        mimeType: "application/json",
        content: "{}",
      },
      picker,
    ).catch((e: unknown) => e)) as ExportFailureError;

    expect(error.stage).toBe("finalize");
    expect(error.message).toBe(FINALIZE_MESSAGE);
    expect(error.technicalDetail).toContain("Close failed");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("abort cleanup failed"),
      expect.anything(),
    );
    expect(abort).toHaveBeenCalledOnce();
  });

  it("reports picker setup errors as a German destination error", async () => {
    const picker = vi.fn(() => Promise.reject(new Error("Picker blocked")));
    const error = (await saveWebExportFile(
      {
        filename: "promptvault-export.json",
        mimeType: "application/json",
        content: "{}",
      },
      picker,
    ).catch((e: unknown) => e)) as ExportFailureError;

    expect(error.stage).toBe("destination");
    expect(error.message).toBe(DESTINATION_MESSAGE);
    expect(error.technicalDetail).toBe("Picker blocked");
  });

  it("reports AbortError while creating the writer as a write error", async () => {
    const cancellation = new DOMException(
      "Writer creation failed",
      "AbortError",
    );
    const picker = vi.fn(() =>
      Promise.resolve({
        createWritable: () => Promise.reject(cancellation),
      }),
    );
    const error = (await saveWebExportFile(
      {
        filename: "promptvault-export.json",
        mimeType: "application/json",
        content: "{}",
      },
      picker,
    ).catch((e: unknown) => e)) as ExportFailureError;

    expect(error.stage).toBe("write");
    expect(error.message).toBe(WRITE_MESSAGE);
    expect(error.technicalDetail).toContain("Writer creation failed");
  });

  it("reports AbortError from a failed write as a write error", async () => {
    const cancellation = new DOMException("Cancelled", "AbortError");
    const abort = vi.fn(() => Promise.resolve());
    const picker = vi.fn(() =>
      Promise.resolve({
        createWritable: () =>
          Promise.resolve({
            write: () => Promise.reject(cancellation),
            close: () => Promise.resolve(),
            abort,
          }),
      }),
    );
    const error = (await saveWebExportFile(
      {
        filename: "promptvault-export.json",
        mimeType: "application/json",
        content: "{}",
      },
      picker,
    ).catch((e: unknown) => e)) as ExportFailureError;

    expect(error.stage).toBe("write");
    expect(error.message).toBe(WRITE_MESSAGE);
    expect(error.technicalDetail).toContain("Cancelled");
    expect(abort).toHaveBeenCalledOnce();
  });

  it("preserves AbortError from cancelling the save picker", async () => {
    const cancellation = new DOMException(
      "Failed to execute 'showSaveFilePicker' on 'Window': The user aborted a request.",
      "AbortError",
    );
    const picker = vi.fn(() => Promise.reject(cancellation));
    await expect(
      saveWebExportFile(
        {
          filename: "promptvault-export.json",
          mimeType: "application/json",
          content: "{}",
        },
        picker,
      ),
    ).rejects.toBe(cancellation);
    expect(isExportCancellation(cancellation)).toBe(true);
  });

  it("reports a picker AbortError for a failed file creation as a write error", async () => {
    // Chrome 140 rejects showSaveFilePicker with AbortError when the selected
    // destination cannot be written (observed: read-only directory).
    const creationFailure = new DOMException(
      "Failed to execute 'showSaveFilePicker' on 'Window': Failed to create or truncate file",
      "AbortError",
    );
    const picker = vi.fn(() => Promise.reject(creationFailure));

    const error = (await saveWebExportFile(
      {
        filename: "promptvault-export.json",
        mimeType: "application/json",
        content: "{}",
      },
      picker,
    ).catch((e: unknown) => e)) as ExportFailureError;

    expect(error).toBeInstanceOf(ExportFailureError);
    expect(error.stage).toBe("destination");
    expect(error.message).toBe(DESTINATION_MESSAGE);
    expect(error.technicalDetail).toContain("Failed to create or truncate file");
    expect(isExportCancellation(error)).toBe(false);
  });

  it("keeps raw browser exception text out of the user-facing message", async () => {
    const raw =
      "Failed to execute 'showSaveFilePicker' on 'Window': Failed to create or truncate file";
    const picker = vi.fn(() => Promise.reject(new DOMException(raw, "AbortError")));

    const error = (await saveWebExportFile(
      {
        filename: "promptvault-export.json",
        mimeType: "application/json",
        content: "{}",
      },
      picker,
    ).catch((e: unknown) => e)) as ExportFailureError;

    expect(error.message).not.toMatch(
      /Failed to execute|showSaveFilePicker|AbortError|Error:/,
    );
    expect(error.technicalDetail).toBe(raw);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(raw),
    );
  });

  it("classifies picker rejections as cancellation or failure", () => {
    expect(
      isExportCancellation(
        new DOMException(
          "Failed to execute 'showSaveFilePicker' on 'Window': The user aborted a request.",
          "AbortError",
        ),
      ),
    ).toBe(true);
    expect(
      isExportCancellation(
        new DOMException(
          "Failed to execute 'showSaveFilePicker' on 'Window': Failed to create or truncate file",
          "AbortError",
        ),
      ),
    ).toBe(false);
    expect(isExportCancellation(new Error("Fehler beim Schreiben: x"))).toBe(
      false,
    );
    // Unknown or missing messages surface as failures instead of staying silent.
    expect(
      isExportCancellation(new DOMException("Cancelled", "AbortError")),
    ).toBe(false);
    expect(isExportCancellation(new DOMException("", "AbortError"))).toBe(
      false,
    );
    expect(isExportCancellation(undefined)).toBe(false);
    // Duck-typed: an AbortError from another realm is still recognized.
    expect(
      isExportCancellation({
        name: "AbortError",
        message: "The user aborted a request.",
      }),
    ).toBe(true);
  });

  it("downloads through an anchor and revokes its object URL", async () => {
    const pickerDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "showSaveFilePicker",
    );
    const createDescriptor = Object.getOwnPropertyDescriptor(
      URL,
      "createObjectURL",
    );
    const revokeDescriptor = Object.getOwnPropertyDescriptor(
      URL,
      "revokeObjectURL",
    );
    const clickedLinks: HTMLAnchorElement[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clickedLinks.push(this);
      });
    const createObjectURL = vi.fn((_blob: Blob) => "blob:promptvault-test");
    const revokeObjectURL = vi.fn();
    Reflect.deleteProperty(window, "showSaveFilePicker");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    vi.useFakeTimers();

    try {
      await saveWebExportFile({
        filename: "promptvault-export.md",
        mimeType: "text/markdown;charset=utf-8",
        content: "Grüße 🌍",
      });

      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
      expect(click).toHaveBeenCalledOnce();
      expect(clickedLinks[0]?.href).toBe("blob:promptvault-test");
      expect(clickedLinks[0]?.download).toBe("promptvault-export.md");
      expect(clickedLinks[0]?.isConnected).toBe(false);
      expect(revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(999);
      expect(revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(revokeObjectURL).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:promptvault-test");
    } finally {
      vi.useRealTimers();
      click.mockRestore();
      if (pickerDescriptor)
        Object.defineProperty(window, "showSaveFilePicker", pickerDescriptor);
      else Reflect.deleteProperty(window, "showSaveFilePicker");
      if (createDescriptor)
        Object.defineProperty(URL, "createObjectURL", createDescriptor);
      else Reflect.deleteProperty(URL, "createObjectURL");
      if (revokeDescriptor)
        Object.defineProperty(URL, "revokeObjectURL", revokeDescriptor);
      else Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  it("calls the browser save picker with window as its receiver", async () => {
    const original = Object.getOwnPropertyDescriptor(
      window,
      "showSaveFilePicker",
    );
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
      if (original)
        Object.defineProperty(window, "showSaveFilePicker", original);
      else Reflect.deleteProperty(window, "showSaveFilePicker");
    }
  });
});
