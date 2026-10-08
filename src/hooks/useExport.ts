import { useState, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/stores/appStore";
import { exportJson, exportMarkdown, exportZip } from "@/lib/tauri";
import { getBackend } from "@/lib/backend/factory";
import {
  buildWebExportContent,
  buildWebExportDocument,
  isExportCancellation,
  saveWebExportFile,
} from "@/lib/export/webExport";
import type { ExportFormat, ExportProgressPayload } from "@/types";

interface UseExportReturn {
  isExporting: boolean;
  progress: number;
  error: string | null;
  exportFormat: ExportFormat;
  setExportFormat: (format: ExportFormat) => void;
  startExport: (favoritesOnly: boolean) => Promise<void>;
}

export function useExport(): UseExportReturn {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json");

  const prompts = useAppStore((s) => s.prompts);
  const evaluations = useAppStore((s) => s.evaluations);
  const hygiene = useAppStore((s) => s.hygiene);
  const unlistenRef = useRef<(() => void) | null>(null);

  const startExport = useCallback(
    async (favoritesOnly: boolean) => {
      // Filter prompts
      let targetPrompts = prompts;
      if (favoritesOnly) {
        targetPrompts = prompts.filter((p) => p.is_favorite);
      }

      if (targetPrompts.length === 0) {
        setError("Keine Prompts zum Exportieren ausgewählt");
        return;
      }

      setIsExporting(true);
      setProgress(0);
      setError(null);

      try {
        if (getBackend().kind === "http") {
          if (exportFormat === "zip") {
            throw new Error("ZIP-Export ist im Webmodus nicht verfügbar.");
          }
          const document = buildWebExportDocument(
            targetPrompts,
            evaluations,
            hygiene,
          );
          await saveWebExportFile(
            buildWebExportContent(exportFormat, document),
          );
          setProgress(100);
          return;
        }

        // Open directory dialog — backend creates files inside chosen directory
        const { open } = await import("@tauri-apps/plugin-dialog");

        const exportPath = await open({
          directory: true,
          multiple: false,
          title: "Export-Zielverzeichnis auswählen",
        });

        if (!exportPath || typeof exportPath !== "string") {
          // User cancelled the dialog
          setIsExporting(false);
          return;
        }

        const promptIds = targetPrompts.map((p) => p.id);
        const evals = Object.values(evaluations);
        const hyg = Object.values(hygiene);

        // Listen for progress events from the Tauri backend
        const unlisten = await listen<ExportProgressPayload>(
          "export:progress",
          (event) => {
            const { current, total } = event.payload;
            if (total > 0) {
              setProgress(Math.round((current / total) * 100));
            }
          },
        );
        unlistenRef.current = unlisten;

        // Call the appropriate export command
        switch (exportFormat) {
          case "json":
            await exportJson(promptIds, exportPath, evals, hyg);
            break;
          case "markdown":
            await exportMarkdown(promptIds, exportPath, evals, hyg);
            break;
          case "zip":
            await exportZip(promptIds, exportPath, evals, hyg);
            break;
        }

        setProgress(100);
      } catch (err) {
        if (isExportCancellation(err)) {
          return;
        }
        setError(
          err instanceof Error ? err.message : "Unbekannter Export-Fehler",
        );
      } finally {
        // Clean up event listener
        if (unlistenRef.current) {
          unlistenRef.current();
          unlistenRef.current = null;
        }
        setIsExporting(false);
      }
    },
    [prompts, exportFormat, evaluations, hygiene],
  );

  return {
    isExporting,
    progress,
    error,
    exportFormat,
    setExportFormat,
    startExport,
  };
}
