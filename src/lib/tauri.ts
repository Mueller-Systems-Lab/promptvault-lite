import { invoke } from "@tauri-apps/api/core";
import type {
  PromptItem,
  PromptEvaluation,
  PromptHygiene,
  AnalysisReport,
  CreatePromptInput,
  UpdatePromptInput,
} from "@/types";
import { isObservabilityEnabled, emitDiagnosticEvent } from "@/observability/events";
import { openSpan } from "@/observability/trace";
import type { Trace, DiagnosticLayer, DiagnosticError } from "@/observability/contracts";
import { OBSERVABILITY_SCHEMA_VERSION } from "@/observability/contracts";

// =============================================================================
// Observability: IPC Instrumentation Wrapper
// =============================================================================

export interface InvokeObservedOptions {
  trace?: Trace;
  operation: string;
  layer: DiagnosticLayer;
  parentSpanId?: string;
  redactArgs?: boolean;
}

export async function invokeObserved<T>(
  command: string,
  args: Record<string, unknown>,
  options: InvokeObservedOptions,
): Promise<T> {
  if (!isObservabilityEnabled() || !options.trace) {
    return invoke<T>(command, args);
  }

  const { endSpan } = openSpan(options.trace, {
    operation: options.operation,
    layer: options.layer,
    parentSpanId: options.parentSpanId,
    stage: command,
    attributes: {
      "promptvault.command": command,
      "promptvault.arg_keys": options.redactArgs
        ? ["[REDACTED]"]
        : Object.keys(args),
    },
  });

  try {
    const result = await invoke<T>(command, args);
    endSpan("succeeded", {
      attributes: {
        "promptvault.command": command,
      },
    });
    return result;
  } catch (err) {
    const error: DiagnosticError = {
      message: err instanceof Error ? err.message : String(err),
      category: "IPC_ERROR",
      reasonCode: "TAURI_INVOKE_FAILED",
      stack: err instanceof Error ? err.stack : undefined,
    };
    endSpan("failed", {
      error,
      reasonCode: "TAURI_INVOKE_FAILED",
    });
    throw err;
  }
}

// =============================================================================
// Typisierte Tauri API-Wrapper für PromptVault Lite
// =============================================================================

// --- Scanner ---

export interface TauriCallOptions {
  trace?: Trace;
  parentSpanId?: string;
}

interface TraceContextInput {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

interface BackendSpanResponse {
  traceId: string;
  spanId: string;
  parentSpanId?: string | null;
  backendTimestamp: string;
  backendDurationMs?: number | null;
}

interface BackendCorrelated {
  backend_span?: BackendSpanResponse | null;
  [key: string]: unknown;
}

/**
 * Record a backend-origin span event when the Rust command returned one.
 * This emits a "rust-analysis" layer event ONLY from real backend data —
 * never synthesized by the frontend.
 */
function recordBackendSpan(
  backendSpan: BackendSpanResponse,
  operation: string,
): void {
  emitDiagnosticEvent({
    schemaVersion: OBSERVABILITY_SCHEMA_VERSION,
    traceId: backendSpan.traceId,
    spanId: backendSpan.spanId,
    parentSpanId: backendSpan.parentSpanId ?? undefined,
    timestamp: backendSpan.backendTimestamp,
    durationMs: backendSpan.backendDurationMs ?? undefined,
    layer: "rust-analysis",
    operation,
    stage: operation,
    status: "succeeded",
    attributes: {
      "promptvault.backend.origin": "rust",
      "promptvault.backend.duration_ms": backendSpan.backendDurationMs ?? null,
    },
  });
}

export async function scanDirectory(path: string, opts?: TauriCallOptions): Promise<PromptItem[]> {
  if (opts?.trace) {
    return invokeObserved<PromptItem[]>("scan_directory", { path }, {
      trace: opts.trace,
      operation: "scan-directory",
      layer: "tauri-ipc",
      parentSpanId: opts.parentSpanId,
      redactArgs: true,
    });
  }
  return invoke<PromptItem[]>("scan_directory", { path });
}

// --- Analyse ---

export async function evaluatePrompt(
  promptId: string,
  content: string,
  opts?: TauriCallOptions,
): Promise<PromptEvaluation> {
  if (opts?.trace) {
    const result = await invokeObserved<PromptEvaluation>("evaluate_prompt", {
      promptId,
      content,
      trace: buildTraceContext(opts.trace, opts.parentSpanId),
    }, {
      trace: opts.trace,
      operation: "evaluate-prompt",
      layer: "tauri-ipc",
      parentSpanId: opts.parentSpanId,
      redactArgs: true,
    });
    const correlated = result as unknown as BackendCorrelated;
    if (correlated.backend_span) {
      recordBackendSpan(correlated.backend_span, "evaluate-prompt");
    }
    return result;
  }
  return invoke<PromptEvaluation>("evaluate_prompt", { promptId, content });
}

export async function analyzeHygiene(
  promptId: string,
  content: string,
  opts?: TauriCallOptions,
): Promise<PromptHygiene> {
  if (opts?.trace) {
    const result = await invokeObserved<PromptHygiene>("analyze_hygiene", {
      promptId,
      content,
      trace: buildTraceContext(opts.trace, opts.parentSpanId),
    }, {
      trace: opts.trace,
      operation: "analyze-hygiene",
      layer: "tauri-ipc",
      parentSpanId: opts.parentSpanId,
      redactArgs: true,
    });
    const correlated = result as unknown as BackendCorrelated;
    if (correlated.backend_span) {
      recordBackendSpan(correlated.backend_span, "analyze-hygiene");
    }
    return result;
  }
  return invoke<PromptHygiene>("analyze_hygiene", { promptId, content });
}

/**
 * Build a trace context input for a backend command.
 * The spanId here is a fresh span for the IPC-boundary call.
 */
function buildTraceContext(
  trace: Trace,
  parentSpanId?: string,
): TraceContextInput {
  const spanId = `ipc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return {
    traceId: trace.traceId,
    spanId,
    parentSpanId,
  };
}

export async function analyzeAll(
  prompts: PromptItem[],
  opts?: TauriCallOptions,
): Promise<AnalysisReport> {
  if (opts?.trace) {
    return invokeObserved<AnalysisReport>("analyze_all", { prompts }, {
      trace: opts.trace,
      operation: "analyze-all-batch",
      layer: "tauri-ipc",
      parentSpanId: opts.parentSpanId,
      redactArgs: true,
    });
  }
  return invoke<AnalysisReport>("analyze_all", { prompts });
}

// --- Favoriten ---

export async function toggleFavorite(promptId: string, opts?: TauriCallOptions): Promise<boolean> {
  if (opts?.trace) {
    return invokeObserved<boolean>("toggle_favorite", { promptId }, {
      trace: opts.trace,
      operation: "toggle-favorite",
      layer: "tauri-ipc",
      parentSpanId: opts.parentSpanId,
    });
  }
  return invoke<boolean>("toggle_favorite", { promptId });
}

// --- Export ---

export async function exportJson(
  promptIds: string[],
  exportPath: string,
  evaluations: PromptEvaluation[],
  hygiene: PromptHygiene[],
  opts?: TauriCallOptions,
): Promise<string> {
  if (opts?.trace) {
    return invokeObserved<string>("export_json", { promptIds, exportPath, evaluations, hygiene }, {
      trace: opts.trace,
      operation: "export-json",
      layer: "tauri-ipc",
      parentSpanId: opts.parentSpanId,
      redactArgs: true,
    });
  }
  return invoke<string>("export_json", { promptIds, exportPath, evaluations, hygiene });
}

export async function exportMarkdown(
  promptIds: string[],
  exportPath: string,
  evaluations: PromptEvaluation[],
  hygiene: PromptHygiene[],
  opts?: TauriCallOptions,
): Promise<string> {
  if (opts?.trace) {
    return invokeObserved<string>("export_markdown", { promptIds, exportPath, evaluations, hygiene }, {
      trace: opts.trace,
      operation: "export-markdown",
      layer: "tauri-ipc",
      parentSpanId: opts.parentSpanId,
      redactArgs: true,
    });
  }
  return invoke<string>("export_markdown", { promptIds, exportPath, evaluations, hygiene });
}

export async function exportZip(
  promptIds: string[],
  exportPath: string,
  evaluations: PromptEvaluation[],
  hygiene: PromptHygiene[],
  opts?: TauriCallOptions,
): Promise<string> {
  if (opts?.trace) {
    return invokeObserved<string>("export_zip", { promptIds, exportPath, evaluations, hygiene }, {
      trace: opts.trace,
      operation: "export-zip",
      layer: "tauri-ipc",
      parentSpanId: opts.parentSpanId,
      redactArgs: true,
    });
  }
  return invoke<string>("export_zip", { promptIds, exportPath, evaluations, hygiene });
}

// --- File Watcher ---

export async function startFileWatcher(path: string, opts?: TauriCallOptions): Promise<void> {
  if (opts?.trace) {
    const { endSpan } = openSpan(opts.trace, {
      operation: "start-watcher",
      layer: "tauri-ipc",
      parentSpanId: opts.parentSpanId,
      stage: "start_file_watcher",
      attributes: { "promptvault.command": "start_file_watcher" },
    });
    try {
      await invoke("start_file_watcher", { path });
      endSpan("succeeded");
    } catch (err) {
      endSpan("failed", {
        reasonCode: "TAURI_INVOKE_FAILED",
        error: {
          message: String(err),
          category: "IPC_ERROR",
          reasonCode: "TAURI_INVOKE_FAILED",
        },
      });
      throw err;
    }
    return;
  }
  await invoke("start_file_watcher", { path });
}

export async function stopFileWatcher(opts?: TauriCallOptions): Promise<void> {
  if (opts?.trace) {
    const { endSpan } = openSpan(opts.trace, {
      operation: "stop-watcher",
      layer: "tauri-ipc",
      parentSpanId: opts.parentSpanId,
      stage: "stop_file_watcher",
    });
    try {
      await invoke("stop_file_watcher");
      endSpan("succeeded");
    } catch (err) {
      endSpan("failed", {
        reasonCode: "TAURI_INVOKE_FAILED",
        error: {
          message: String(err),
          category: "IPC_ERROR",
          reasonCode: "TAURI_INVOKE_FAILED",
        },
      });
      throw err;
    }
    return;
  }
  await invoke("stop_file_watcher");
}

// --- Prompt CRUD ---

export async function createPrompt(
  input: CreatePromptInput,
  opts?: TauriCallOptions,
): Promise<PromptItem> {
  if (opts?.trace) {
    return invokeObserved<PromptItem>("create_prompt", { input }, {
      trace: opts.trace,
      operation: "create-prompt",
      layer: "tauri-ipc",
      parentSpanId: opts.parentSpanId,
      redactArgs: true,
    });
  }
  return invoke<PromptItem>("create_prompt", { input });
}

export async function updatePrompt(
  input: UpdatePromptInput,
  opts?: TauriCallOptions,
): Promise<PromptItem> {
  if (opts?.trace) {
    return invokeObserved<PromptItem>("update_prompt", { input }, {
      trace: opts.trace,
      operation: "update-prompt",
      layer: "tauri-ipc",
      parentSpanId: opts.parentSpanId,
      redactArgs: true,
    });
  }
  return invoke<PromptItem>("update_prompt", { input });
}
