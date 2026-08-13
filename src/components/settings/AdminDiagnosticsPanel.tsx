// =============================================================================
// PromptVault Lite — Admin Diagnostics Panel
// =============================================================================
// Real-time observability UI: overview, timeline, detail view, filters,
// export, copy, clear. Accessibility-compliant.
// =============================================================================

import { useState, useEffect, useMemo } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useObservabilityStore } from "@/observability/observabilityStore";
import type { DiagnosticEvent, Trace } from "@/observability/contracts";

type TabId = "overview" | "timeline" | "detail";

type StatusFilter = "all" | "failed" | "blocked" | "skipped" | "partial_failure" | "succeeded";

const STATUS_ICONS: Record<string, string> = {
  started: "\u25CB",
  succeeded: "\u2713",
  failed: "\u00D7",
  blocked: "\u2298",
  skipped: "\u2192",
  fallback: "\u21B3",
  partial_failure: "\u25D0",
};

const STATUS_COLORS: Record<string, string> = {
  started: "#888",
  succeeded: "#4caf50",
  failed: "#f44336",
  blocked: "#ff9800",
  skipped: "#888",
  fallback: "#2196f3",
  partial_failure: "#ff5722",
};

const LAYER_LABELS: Record<string, string> = {
  ui: "UI",
  store: "Store",
  typescript: "TS",
  "tauri-ipc": "IPC",
  "rust-command": "Rust-Cmd",
  "rust-scanner": "Scanner",
  "rust-parser": "Parser",
  "rust-analysis": "Analysis",
  persistence: "Persist",
};

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "Alle", value: "all" },
  { label: "\u2713 Erfolgreich", value: "succeeded" },
  { label: "\u00D7 Fehlgeschlagen", value: "failed" },
  { label: "\u2298 Blockiert", value: "blocked" },
  { label: "\u2192 \u00DCbersprungen", value: "skipped" },
  { label: "\u25D0 Teilweise", value: "partial_failure" },
];

interface AdminDiagnosticsPanelProps {
  onClose: () => void;
}

export function AdminDiagnosticsPanel({ onClose }: AdminDiagnosticsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedEvent, setSelectedEvent] = useState<DiagnosticEvent | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const isDeepEnabled = useObservabilityStore((s) => s.isDeepEnabled);
  const traces = useObservabilityStore((s) => s.traces);
  const allEvents = useObservabilityStore((s) => s.events);
  const clearDiagnostics = useObservabilityStore((s) => s.clearDiagnostics);
  const exportDiagnostics = useObservabilityStore((s) => s.exportDiagnostics);
  const copyDiagnostics = useObservabilityStore((s) => s.copyDiagnostics);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const filteredEvents = useMemo(() => {
    if (statusFilter === "all") return allEvents;
    return allEvents.filter((e) => e.status === statusFilter);
  }, [allEvents, statusFilter]);

  const counts = useMemo(() => {
    let succeeded = 0;
    let failed = 0;
    let blocked = 0;
    let skipped = 0;
    let partial = 0;
    for (const e of allEvents) {
      if (e.status === "succeeded") succeeded++;
      else if (e.status === "failed") failed++;
      else if (e.status === "blocked") blocked++;
      else if (e.status === "skipped") skipped++;
      else if (e.status === "partial_failure") partial++;
    }
    return { succeeded, failed, blocked, skipped, partial };
  }, [allEvents]);

  const invariants = useMemo(() => {
    const violations = [];
    for (const e of allEvents) {
      if (e.invariantViolations) violations.push(...e.invariantViolations);
    }
    return violations;
  }, [allEvents]);

  const handleExport = () => {
    const data = exportDiagnostics(__APP_VERSION__);
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `promptvault-diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    const text = copyDiagnostics();
    void navigator.clipboard.writeText(text).catch(() => { /* clipboard API not available */ });
  };

  const handleEventClick = (event: DiagnosticEvent) => {
    setSelectedEvent(event);
    const trace = traces.find((t) => t.traceId === event.traceId);
    setSelectedTrace(trace ?? null);
    setActiveTab("detail");
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString();
    } catch {
      return iso;
    }
  };

  const focusTrapRef = useFocusTrap(true);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-dialog modal-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-label="Admin Diagnostics"
        ref={focusTrapRef}
      >
        <div className="modal-header">
          <h2>
            Admin Diagnostics{" "}
            <span style={{ color: "#4caf50", fontSize: "0.8em" }}>● ACTIVE</span>
            {isDeepEnabled && (
              <span style={{ color: "#ff9800", fontSize: "0.7em", marginLeft: "0.5em" }}>
                DEEP
              </span>
            )}
          </h2>
          <button
            className="btn btn-icon modal-close"
            onClick={onClose}
            aria-label="Diagnostics schlie\u00DFen"
          >
            \u2715
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {/* Tab Navigation */}
          <div className="diag-tabs" role="tablist">
            {(["overview", "timeline", "detail"] as TabId[]).map((tab) => (
              <button
                key={tab}
                className={`btn btn-tab ${activeTab === tab ? "btn-tab--active" : ""}`}
                onClick={() => {
                  setActiveTab(tab);
                }}
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls={`panel-${tab}`}
                id={`tab-${tab}`}
              >
                {tab === "overview" ? "\u00DCbersicht" : tab === "timeline" ? "Timeline" : "Detail"}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div
              id="panel-overview"
              role="tabpanel"
              aria-labelledby="tab-overview"
              className="diag-panel"
            >
              <section className="diag-section">
                <h3 className="diag-section-title">Status</h3>
                <div className="diag-status-grid">
                  <div className="diag-stat diag-stat--success">
                    <span className="diag-stat-icon">{STATUS_ICONS.succeeded}</span>
                    <span className="diag-stat-value">{counts.succeeded}</span>
                    <span className="diag-stat-label">Erfolgreich</span>
                  </div>
                  <div className="diag-stat diag-stat--fail">
                    <span className="diag-stat-icon">{STATUS_ICONS.failed}</span>
                    <span className="diag-stat-value">{counts.failed}</span>
                    <span className="diag-stat-label">Fehler</span>
                  </div>
                  <div className="diag-stat diag-stat--block">
                    <span className="diag-stat-icon">{STATUS_ICONS.blocked}</span>
                    <span className="diag-stat-value">{counts.blocked}</span>
                    <span className="diag-stat-label">Blockiert</span>
                  </div>
                  <div className="diag-stat diag-stat--skip">
                    <span className="diag-stat-icon">{STATUS_ICONS.skipped}</span>
                    <span className="diag-stat-value">{counts.skipped}</span>
                    <span className="diag-stat-label">\u00DCbersprungen</span>
                  </div>
                  <div className="diag-stat diag-stat--partial">
                    <span className="diag-stat-icon">{STATUS_ICONS.partial_failure}</span>
                    <span className="diag-stat-value">{counts.partial}</span>
                    <span className="diag-stat-label">Teilweise</span>
                  </div>
                </div>
              </section>

              <section className="diag-section">
                <h3 className="diag-section-title">Letzte Operationen</h3>
                <div className="diag-trace-list">
                  {traces.slice(-10).reverse().map((trace) => (
                    <div
                      key={trace.traceId}
                      className="diag-trace-item"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedTrace(trace);
                        setActiveTab("detail");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setSelectedTrace(trace);
                          setActiveTab("detail");
                        }
                      }}
                    >
                      <span
                        style={{ color: STATUS_COLORS[trace.status] ?? "#888", marginRight: "0.5em" }}
                      >
                        {STATUS_ICONS[trace.status] ?? "?"}
                      </span>
                      <span className="diag-trace-op">{trace.operation}</span>
                      <span className="diag-trace-id" style={{ marginLeft: "auto", fontSize: "0.75em", opacity: 0.6 }}>
                        {formatTime(trace.startedAt)}
                      </span>
                    </div>
                  ))}
                  {traces.length === 0 && (
                    <div className="diag-empty">
                      Keine Traces erfasst. Admin Observability ist aktiv — f\u00FChren Sie eine Operation aus.
                    </div>
                  )}
                </div>
              </section>

              {invariants.length > 0 && (
                <section className="diag-section">
                  <h3 className="diag-section-title" style={{ color: "#f44336" }}>
                    &#9888; Invariant Violations ({invariants.length})
                  </h3>
                  <div className="diag-invariant-list">
                    {invariants.map((v, i) => (
                      <div key={i} className="diag-invariant-item">
                        <span className="diag-invariant-code">{v.reasonCode}</span>
                        <span className="diag-invariant-desc">{v.description}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="diag-section">
                <h3 className="diag-section-title">Traces gesamt: {traces.length} / 100</h3>
                <h3 className="diag-section-title">Events gesamt: {allEvents.length} / 2000</h3>
              </section>
            </div>
          )}

          {/* Timeline Tab */}
          {activeTab === "timeline" && (
            <div
              id="panel-timeline"
              role="tabpanel"
              aria-labelledby="tab-timeline"
              className="diag-panel"
            >
              <div className="diag-filter-bar">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    className={`btn btn-sm ${statusFilter === f.value ? "btn-primary" : ""}`}
                    onClick={() => {
                      setStatusFilter(f.value);
                    }}
                    aria-pressed={statusFilter === f.value}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="diag-timeline">
                {filteredEvents.slice(-200).reverse().map((event) => (
                  <div
                    key={event.spanId}
                    className="diag-timeline-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      handleEventClick(event);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEventClick(event);
                    }}
                  >
                    <span
                      className="diag-timeline-status"
                      style={{ color: STATUS_COLORS[event.status] ?? "#888" }}
                    >
                      {STATUS_ICONS[event.status] ?? "?"}
                    </span>
                    <span className="diag-timeline-time">
                      {formatTime(event.timestamp)}
                    </span>
                    <span className="diag-timeline-layer">
                      [{LAYER_LABELS[event.layer] ?? event.layer}]
                    </span>
                    <span className="diag-timeline-op">{event.operation}</span>
                    {event.stage !== event.operation && (
                      <span className="diag-timeline-stage">{event.stage}</span>
                    )}
                    {event.durationMs !== undefined && (
                      <span className="diag-timeline-dur">{event.durationMs}ms</span>
                    )}
                    {event.reasonCode && (
                      <span className="diag-timeline-reason">{event.reasonCode}</span>
                    )}
                  </div>
                ))}
                {filteredEvents.length === 0 && (
                  <div className="diag-empty">
                    {statusFilter === "all"
                      ? "Keine Events. F\u00FChren Sie eine Operation aus."
                      : `Keine Events mit Status "${statusFilter}"`}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Detail Tab */}
          {activeTab === "detail" && (
            <div
              id="panel-detail"
              role="tabpanel"
              aria-labelledby="tab-detail"
              className="diag-panel"
            >
              {selectedEvent ? (
                <div className="diag-detail">
                  <section className="diag-section">
                    <h3 className="diag-section-title">Span Detail</h3>
                    <dl className="diag-dl">
                      <dt>Operation</dt>
                      <dd>{selectedEvent.operation}</dd>
                      <dt>Layer</dt>
                      <dd>{LAYER_LABELS[selectedEvent.layer] ?? selectedEvent.layer}</dd>
                      <dt>Status</dt>
                      <dd style={{ color: STATUS_COLORS[selectedEvent.status] ?? "#888" }}>
                        {STATUS_ICONS[selectedEvent.status] ?? "?"} {selectedEvent.status}
                      </dd>
                      <dt>Stage</dt>
                      <dd>{selectedEvent.stage}</dd>
                      {selectedEvent.durationMs !== undefined && (
                        <>
                          <dt>Duration</dt>
                          <dd>{selectedEvent.durationMs}ms</dd>
                        </>
                      )}
                      {selectedEvent.reasonCode && (
                        <>
                          <dt>Reason</dt>
                          <dd>{selectedEvent.reasonCode}</dd>
                        </>
                      )}
                      {selectedEvent.category && (
                        <>
                          <dt>Category</dt>
                          <dd>{selectedEvent.category}</dd>
                        </>
                      )}
                      {selectedEvent.inputFingerprint && (
                        <>
                          <dt>Input FP</dt>
                          <dd style={{ fontFamily: "monospace", fontSize: "0.8em" }}>
                            {selectedEvent.inputFingerprint}
                          </dd>
                        </>
                      )}
                      {selectedEvent.outputFingerprint && (
                        <>
                          <dt>Output FP</dt>
                          <dd style={{ fontFamily: "monospace", fontSize: "0.8em" }}>
                            {selectedEvent.outputFingerprint}
                          </dd>
                        </>
                      )}
                      <dt>Trace ID</dt>
                      <dd style={{ fontFamily: "monospace", fontSize: "0.75em" }}>
                        {selectedEvent.traceId}
                      </dd>
                      <dt>Span ID</dt>
                      <dd style={{ fontFamily: "monospace", fontSize: "0.75em" }}>
                        {selectedEvent.spanId}
                      </dd>
                      {selectedEvent.parentSpanId && (
                        <>
                          <dt>Parent Span</dt>
                          <dd style={{ fontFamily: "monospace", fontSize: "0.75em" }}>
                            {selectedEvent.parentSpanId}
                          </dd>
                        </>
                      )}
                    </dl>
                  </section>

                  {selectedEvent.error && (
                    <section className="diag-section">
                      <h3 className="diag-section-title" style={{ color: "#f44336" }}>
                        Error
                      </h3>
                      <dl className="diag-dl">
                        <dt>Message</dt>
                        <dd>{selectedEvent.error.message}</dd>
                        <dt>Category</dt>
                        <dd>{selectedEvent.error.category}</dd>
                        <dt>Reason Code</dt>
                        <dd>{selectedEvent.error.reasonCode}</dd>
                      </dl>
                    </section>
                  )}

                  {selectedEvent.invariantViolations && selectedEvent.invariantViolations.length > 0 && (
                    <section className="diag-section">
                      <h3 className="diag-section-title" style={{ color: "#f44336" }}>
                        Invariant Violations
                      </h3>
                      {selectedEvent.invariantViolations.map((v, i) => (
                        <div key={i} className="diag-invariant-item">
                          <span className="diag-invariant-code">{v.reasonCode}</span>
                          <span className="diag-invariant-desc">{v.description}</span>
                        </div>
                      ))}
                    </section>
                  )}

                  {selectedEvent.attributes && Object.keys(selectedEvent.attributes).length > 0 && (
                    <section className="diag-section">
                      <h3 className="diag-section-title">Attributes</h3>
                      <dl className="diag-dl">
                        {Object.entries(selectedEvent.attributes).map(([key, value]) => (
                          <>
                            <dt key={`dt-${key}`}>{key}</dt>
                            <dd key={`dd-${key}`} style={{ fontFamily: "monospace", fontSize: "0.8em" }}>
                              {typeof value === "object" ? JSON.stringify(value) : String(value)}
                            </dd>
                          </>
                        ))}
                      </dl>
                    </section>
                  )}

                  {selectedTrace && (
                    <section className="diag-section">
                      <h3 className="diag-section-title">
                        Children ({selectedTrace.spans.filter((s) => s.parentSpanId === selectedEvent.spanId).length})
                      </h3>
                      <div className="diag-timeline">
                        {selectedTrace.spans
                          .filter((s) => s.parentSpanId === selectedEvent.spanId)
                          .map((span) => (
                            <div key={span.spanId} className="diag-timeline-item">
                              <span
                                className="diag-timeline-status"
                                style={{ color: STATUS_COLORS[span.status] ?? "#888" }}
                              >
                                {STATUS_ICONS[span.status] ?? "?"}
                              </span>
                              <span className="diag-timeline-op">{span.operation}</span>
                              {span.durationMs !== undefined && (
                                <span className="diag-timeline-dur">{span.durationMs}ms</span>
                              )}
                            </div>
                          ))}
                        {selectedTrace.spans.filter((s) => s.parentSpanId === selectedEvent.spanId).length === 0 && (
                          <div className="diag-empty">Keine Kind-Spans.</div>
                        )}
                      </div>
                    </section>
                  )}
                </div>
              ) : (
                <div className="diag-empty">
                  W\u00E4hlen Sie ein Event aus der Timeline, um Details anzuzeigen.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            className="btn"
            onClick={handleCopy}
            aria-label="Diagnose kopieren"
            title="Diagnose-Daten kompakt in die Zwischenablage kopieren"
          >
            📋 Kopieren
          </button>
          <button
            className="btn"
            onClick={handleExport}
            aria-label="Diagnose exportieren"
            title="Diagnose-Bundle als JSON exportieren (redigiert)"
          >
            📦 Exportieren
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              clearDiagnostics();
              setSelectedEvent(null);
              setSelectedTrace(null);
            }}
            aria-label="Diagnosedaten löschen"
            title="Alle Trace- und Event-Daten löschen"
          >
            🗑 Löschen
          </button>
          <button
            className="btn btn-primary"
            onClick={onClose}
            aria-label="Schließen"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
