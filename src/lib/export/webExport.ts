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

export type ExportFailureStage = "destination" | "write" | "finalize";

const EXPORT_FAILURE_MESSAGES: Record<ExportFailureStage, string> = {
  destination:
    "Der Speicherort konnte nicht ausgewählt oder angelegt werden. Bitte einen anderen Ordner wählen.",
  write:
    "Die Exportdatei konnte nicht geschrieben werden. Bitte freien Speicherplatz prüfen und erneut versuchen.",
  finalize:
    "Die Exportdatei konnte nicht abgeschlossen werden. Bitte erneut versuchen.",
};

/**
 * Export failure with a user-facing German message. The raw browser or
 * filesystem text stays in `technicalDetail` (and on the console) instead of
 * being shown in the UI.
 */
export class ExportFailureError extends Error {
  readonly stage: ExportFailureStage;
  readonly technicalDetail: string;

  constructor(stage: ExportFailureStage, technicalDetail: string) {
    super(EXPORT_FAILURE_MESSAGES[stage]);
    this.name = "ExportFailureError";
    this.stage = stage;
    this.technicalDetail = technicalDetail;
  }
}

/**
 * Raw exception text for the developer channel. Duck-typed so DOMExceptions
 * (which are not `instanceof Error` in every environment) report their message
 * instead of a `name: message` composite.
 */
function technicalMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const { message } = error as { message?: unknown };
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  return String(error);
}

function failExport(
  stage: ExportFailureStage,
  error: unknown,
): ExportFailureError {
  const technicalDetail = technicalMessage(error);
  // Developer-facing channel: the raw exception text stays out of the UI.
  console.error(`[export] ${stage} failure: ${technicalDetail}`);
  return new ExportFailureError(stage, technicalDetail);
}

// Chrome rejects showSaveFilePicker with AbortError both when the user
// dismisses the dialog ("The user aborted a request.") and when the chosen
// file cannot be created or truncated ("Failed to create or truncate file").
// The message is the only discriminator Chrome offers, so cancellation is the
// narrow, positively identified case: anything unrecognized stays a surfaced
// failure instead of silently ending the export.
const PICKER_DISMISSAL_MESSAGE = /user aborted/i;

/**
 * Message of an AbortError-shaped rejection, or null when it is not one.
 * Duck-typed so cross-realm DOMExceptions are recognized too.
 */
function abortErrorMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const candidate = error as { name?: unknown; message?: unknown };
  if (candidate.name !== "AbortError") {
    return null;
  }
  return typeof candidate.message === "string" ? candidate.message : "";
}

/**
 * True only for a deliberate save-picker dismissal. Failed file creations and
 * unrecognized aborts must surface as export failures instead of being misread
 * as a cancellation. Shared by both export backends: the desktop path only
 * reaches this check with non-abort errors, which are surfaced as before.
 */
export function isExportCancellation(error: unknown): boolean {
  const message = abortErrorMessage(error);
  return message !== null && PICKER_DISMISSAL_MESSAGE.test(message);
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
    let handle: SaveFileHandle;
    try {
      handle = await pickerToUse({
        suggestedName: file.filename,
        types: [
          {
            description: "PromptVault export",
            accept: { [file.mimeType.split(";")[0]]: [extension] },
          },
        ],
      });
    } catch (error) {
      // A dismissal ends the export quietly; every other picker failure is a
      // destination failure for the user.
      if (isExportCancellation(error)) {
        throw error;
      }
      throw failExport("destination", error);
    }
    let writable: WritableFile;
    try {
      writable = await handle.createWritable();
    } catch (error) {
      throw failExport("write", error);
    }
    try {
      await writable.write(blob);
    } catch (error) {
      // Aborting discards the temporary file; closing could commit a partial write.
      try {
        await writable.abort();
      } catch (cleanupError) {
        // Preserve the original write failure for the caller.
        console.error("[export] write abort cleanup failed:", cleanupError);
      }
      throw failExport("write", error);
    }
    try {
      await writable.close();
    } catch (error) {
      try {
        await writable.abort();
      } catch (cleanupError) {
        // Preserve the close failure if cleanup also fails.
        console.error("[export] finalize abort cleanup failed:", cleanupError);
      }
      throw failExport("finalize", error);
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
