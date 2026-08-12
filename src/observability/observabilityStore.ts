// =============================================================================
// PromptVault Lite — Admin Observability Mode — Zustand Store
// =============================================================================
// Separate store for observability state. Never mixed with appStore.
// Ring-buffer bounded. Session-only (no persistence except on/off flags).
// =============================================================================

import { create } from "zustand";
import type {
  DiagnosticEvent,
  Trace,
  InvariantViolation,
  DiagnosticExport,
  ReasonCode,
} from "./contracts";
import {
  isObservabilityEnabled,
  setObservabilityEnabled,
  isDeepDiagnosticsEnabled,
  setDeepDiagnosticsEnabled,
  loadObservabilityState,
  subscribeToEvents,
  subscribeToTraces,
  clearAll,
  getEvents,
  getTraces,
} from "./events";
import {
  buildDiagnosticExport,
  buildDiagnosticCopy,
} from "./redaction";

interface ObservabilityState {
  isEnabled: boolean;
  isDeepEnabled: boolean;

  events: DiagnosticEvent[];
  traces: Trace[];

  filterStatus: string | null;
  filterLayer: string | null;
  filterOperation: string | null;
  filterReasonCode: ReasonCode | null;

  clearDiagnostics: () => void;
  toggleObservability: () => void;
  toggleDeepDiagnostics: () => void;
  setFilterStatus: (status: string | null) => void;
  setFilterLayer: (layer: string | null) => void;
  setFilterOperation: (operation: string | null) => void;
  setFilterReasonCode: (reasonCode: ReasonCode | null) => void;

  getFilteredEvents: () => DiagnosticEvent[];

  exportDiagnostics: (
    appVersion: string,
    vaultRoot?: string,
  ) => DiagnosticExport | null;

  copyDiagnostics: () => string;

  getInvariants: () => InvariantViolation[];
}

loadObservabilityState();

export const useObservabilityStore = create<ObservabilityState>((set, get) => {
  subscribeToEvents((events) => {
    set({ events });
  });

  subscribeToTraces((traces) => {
    set({ traces });
  });

  return {
    isEnabled: isObservabilityEnabled(),
    isDeepEnabled: isDeepDiagnosticsEnabled(),

    events: getEvents() as DiagnosticEvent[],
    traces: getTraces() as Trace[],

    filterStatus: null,
    filterLayer: null,
    filterOperation: null,
    filterReasonCode: null,

    clearDiagnostics: () => {
      clearAll();
      set({ events: [], traces: [] });
    },

    toggleObservability: () => {
      const current = get().isEnabled;
      const next = !current;
      setObservabilityEnabled(next);
      if (!next) {
        setDeepDiagnosticsEnabled(false);
        set({ isEnabled: false, isDeepEnabled: false });
      } else {
        set({ isEnabled: true, isDeepEnabled: false });
      }
    },

    toggleDeepDiagnostics: () => {
      if (!get().isEnabled) return;
      const current = get().isDeepEnabled;
      const next = !current;
      setDeepDiagnosticsEnabled(next);
      set({ isDeepEnabled: next });
    },

    setFilterStatus: (status) => { set({ filterStatus: status }); },
    setFilterLayer: (layer) => { set({ filterLayer: layer }); },
    setFilterOperation: (operation) => { set({ filterOperation: operation }); },
    setFilterReasonCode: (reasonCode) => { set({ filterReasonCode: reasonCode }); },

    getFilteredEvents: () => {
      const state = get();
      let filtered = state.events;
      if (state.filterStatus) {
        filtered = filtered.filter((e) => e.status === state.filterStatus);
      }
      if (state.filterLayer) {
        filtered = filtered.filter((e) => e.layer === state.filterLayer);
      }
      if (state.filterOperation) {
        filtered = filtered.filter((e) => {
          if (!state.filterOperation) return true;
          return e.operation.includes(state.filterOperation);
        });
      }
      if (state.filterReasonCode) {
        filtered = filtered.filter(
          (e) => e.reasonCode === state.filterReasonCode,
        );
      }
      return filtered;
    },

    exportDiagnostics: (appVersion, vaultRoot?) => {
      const state = get();
      const invariants = state.getInvariants();
      return buildDiagnosticExport(
        appVersion,
        navigator.platform,
        {
          observability: state.isEnabled,
          deepDiagnostics: state.isDeepEnabled,
        },
        state.traces,
        state.events,
        invariants,
        vaultRoot,
      );
    },

    copyDiagnostics: () => {
      const state = get();
      const latestTrace = state.traces.length > 0
        ? state.traces[state.traces.length - 1]
        : undefined;
      return buildDiagnosticCopy(latestTrace, state.events);
    },

    getInvariants: () => {
      const state = get();
      const violations: InvariantViolation[] = [];
      for (const event of state.events) {
        if (event.invariantViolations) {
          violations.push(...event.invariantViolations);
        }
      }
      return violations;
    },
  };
});
