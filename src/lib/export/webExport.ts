import type {
  ExportFormat,
  PromptEvaluation,
  PromptHygiene,
  PromptItem,
} from "@/types";

export interface WebExportEntry extends PromptItem {
  quality_score: number | null;
  hygiene_score: number | null;
}

export interface WebExportDocument {
  export_date: string;
  version: string;
  prompts: WebExportEntry[];
}

type ExportSourcePrompt = Omit<PromptItem, "category"> & {
  category?: string | null;
};

export function buildWebExportDocument(
  prompts: ExportSourcePrompt[],
  evaluations: Record<string, PromptEvaluation>,
  hygiene: Record<string, PromptHygiene>,
  exportDate = new Date().toISOString(),
): WebExportDocument {
  return {
    export_date: exportDate,
    version: __APP_VERSION__,
    prompts: prompts.map((prompt) => {
      const evaluation = Object.prototype.hasOwnProperty.call(
        evaluations,
        prompt.id,
      )
        ? evaluations[prompt.id]
        : undefined;
      const hygieneResult = Object.prototype.hasOwnProperty.call(
        hygiene,
        prompt.id,
      )
        ? hygiene[prompt.id]
        : undefined;
      return {
        ...prompt,
        category: prompt.category?.trim() ? prompt.category : "uncategorized",
        quality_score: evaluation?.overall_score ?? null,
        hygiene_score: hygieneResult?.hygiene_score ?? null,
      };
    }),
  };
}

export function buildWebExportContent(
  format: Exclude<ExportFormat, "zip">,
  document: WebExportDocument,
): { filename: string; mimeType: string; content: string } {
  const stamp = document.export_date.replace(/[:.]/g, "-");
  if (format === "json") {
    return {
      filename: `promptvault-export-${stamp}.json`,
      mimeType: "application/json",
      content: JSON.stringify(document, null, 2),
    };
  }

  const content = document.prompts
    .map((prompt) => {
      const metadata = [
        `title: ${JSON.stringify(prompt.title)}`,
        `description: ${JSON.stringify(prompt.description)}`,
        `category: ${JSON.stringify(prompt.category)}`,
        `version: ${JSON.stringify(prompt.version)}`,
        `tags: ${JSON.stringify(prompt.tags)}`,
        `created_at: ${JSON.stringify(prompt.created_at)}`,
        `updated_at: ${JSON.stringify(prompt.updated_at)}`,
        `# quality_score: ${prompt.quality_score ?? "null"}`,
        `# hygiene_score: ${prompt.hygiene_score ?? "null"}`,
      ].join("\n");
      return `---\n${metadata}\n---\n\n${prompt.content}`;
    })
    .join("\n\n---\n\n");

  return {
    filename: `promptvault-export-${stamp}.md`,
    mimeType: "text/markdown;charset=utf-8",
    content,
  };
}

interface WritableFile {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

interface SaveFileHandle {
  createWritable(): Promise<WritableFile>;
}

interface SaveFileOptions {
  suggestedName: string;
  types: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}

type SaveFilePicker = (options: SaveFileOptions) => Promise<SaveFileHandle>;

function writeError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Fehler beim Schreiben: ${message}`);
}

export async function saveWebExportFile(
  file: { filename: string; mimeType: string; content: string },
  picker?: SaveFilePicker,
): Promise<void> {
  const blob = new Blob([file.content], { type: file.mimeType });
  const browserPicker = (
    window as Window & { showSaveFilePicker?: SaveFilePicker }
  ).showSaveFilePicker;
  const pickerToUse = picker ?? browserPicker?.bind(window);
  if (pickerToUse) {
    const extension = file.filename.endsWith(".json") ? ".json" : ".md";
    const handle = await pickerToUse({
      suggestedName: file.filename,
      types: [
        {
          description: "PromptVault export",
          accept: { [file.mimeType.split(";")[0]]: [extension] },
        },
      ],
    });
    let writable: WritableFile;
    try {
      writable = await handle.createWritable();
    } catch (error) {
      throw writeError(error);
    }
    try {
      await writable.write(blob);
    } catch (error) {
      // Aborting discards the temporary file; closing could commit a partial write.
      try {
        await writable.abort();
      } catch {
        // Preserve the original write failure for the caller.
      }
      throw writeError(error);
    }
    try {
      await writable.close();
    } catch (error) {
      try {
        await writable.abort();
      } catch {
        // Preserve the close failure if cleanup also fails.
      }
      throw writeError(error);
    }
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to begin consuming the blob before revocation.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
