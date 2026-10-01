export { detectBackendKind, hasTauriInternals } from "./detect";
export { httpAdapter, API_BASE } from "./httpAdapter";
export { tauriAdapter } from "./tauriAdapter";
export { getBackend, setBackendOverride } from "./factory";
export type { BackendAdapter, BackendCapabilities } from "./types";
export type { BackendKind, TauriInternals, WindowLike } from "./detect";
