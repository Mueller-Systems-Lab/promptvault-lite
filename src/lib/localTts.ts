// =============================================================================
// PromptVault Lite — Lokale TTS-Erkennung und Sprachausgabe (Issue #200)
// =============================================================================
// Native providers (piper, spd-say, espeak-ng) are called only through
// controlled Tauri commands. Prompt text is passed as data, never
// interpolated into a shell command.
//
// Local-only: no cloud TTS, no HTTP calls, no external audio APIs, no
// automatic model download. Web Speech API remains the final fallback.
// =============================================================================

import { createTrace, openSpan } from "@/observability/trace";
import type { Trace } from "@/observability/contracts";
import {
  isObservabilityEnabled,
  recordCompletedTrace,
} from "@/observability/events";
import { contentFingerprint } from "@/observability/redaction";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LocalTtsProvider =
  | "piper"
  | "speech_dispatcher"
  | "espeak_ng"
  | "web_speech"
  | "none";

export interface LocalTtsStatus {
  available: boolean;
  provider: LocalTtsProvider;
  message?: string;
  neural?: boolean;
}

export interface SpeakOptions {
  language?: string;
  voice?: string;
  rate?: number;
}

interface NativeTtsStatus {
  available: boolean;
  provider: LocalTtsProvider;
  neural: boolean;
  model_installed: boolean;
  message: string;
}

const MAX_TTS_TEXT_LENGTH = 600;

let activeAudio: HTMLAudioElement | null = null;
let activeAudioUrl: string | null = null;
let activePlaybackReject: ((reason?: unknown) => void) | null = null;
let isCurrentlySpeaking = false;

// ---------------------------------------------------------------------------
// Tauri context & native command helpers
// ---------------------------------------------------------------------------

function isTauriContext(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

async function detectNativeTts(): Promise<NativeTtsStatus | null> {
  if (!isTauriContext()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<NativeTtsStatus>("detect_local_tts");
  } catch {
    return null;
  }
}

async function invokeNativeStop(): Promise<void> {
  if (!isTauriContext()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("stop_local_tts");
  } catch {
    // Older Tauri builds remain usable with Web Speech.
  }
}

// ---------------------------------------------------------------------------
// Audio playback (Piper WAV)
// ---------------------------------------------------------------------------

function releaseActiveAudio(): void {
  if (activePlaybackReject) {
    const reject = activePlaybackReject;
    activePlaybackReject = null;
    reject(new Error("Sprachausgabe wurde gestoppt."));
  }
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio.onended = null;
    activeAudio.onerror = null;
    activeAudio = null;
  }
  if (activeAudioUrl) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = null;
  }
}

function playPiperAudio(bytes: number[]): Promise<void> {
  if (typeof Audio === "undefined" || typeof URL === "undefined") {
    return Promise.reject(
      new Error("Lokale Audiowiedergabe ist nicht verfügbar."),
    );
  }

  releaseActiveAudio();
  const audio = new Audio();
  const blob = new Blob([Uint8Array.from(bytes)], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  activeAudio = audio;
  activeAudioUrl = url;
  audio.src = url;

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (done: () => void) => {
      if (settled) return;
      settled = true;
      activePlaybackReject = null;
      audio.onended = null;
      audio.onerror = null;
      isCurrentlySpeaking = false;
      done();
    };
    activePlaybackReject = (reason: unknown) => {
      finish(() => {
        reject(reason instanceof Error ? reason : new Error(String(reason)));
      });
    };
    audio.onended = () => {
      finish(() => {
        releaseActiveAudio();
        resolve();
      });
    };
    audio.onerror = () => {
      finish(() => {
        releaseActiveAudio();
        reject(new Error("Die lokale Audiodatei konnte nicht abgespielt werden."));
      });
    };
    void audio.play().catch((error: unknown) => {
      finish(() => {
        releaseActiveAudio();
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Web Speech helpers
// ---------------------------------------------------------------------------

function isWebSpeechAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const synth = window.speechSynthesis;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!synth) return false;
  try {
    return synth
      .getVoices()
      .some((voice) => voice.lang.startsWith("de") || voice.lang.startsWith("en"));
  } catch {
    return false;
  }
}

function hasWebSpeechActive(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  return window.speechSynthesis.speaking || window.speechSynthesis.pending;
}

// ---------------------------------------------------------------------------
// Observability helpers (metadata-only; never the spoken text)
// ---------------------------------------------------------------------------

function ttsAttributes(provider: string, textLength: number): Record<string, unknown> {
  return {
    "tts.provider": provider,
    "tts.text_length": textLength,
  };
}

function newTrace(): Trace | null {
  return isObservabilityEnabled() ? createTrace("tts-speak") : null;
}

// ---------------------------------------------------------------------------
// Provider Detection
// ---------------------------------------------------------------------------

/**
 * Detects the best available local provider without downloading anything.
 *
 * Priority order:
 * 1. Native providers via the Rust TTS adapter (Piper, spd-say, espeak-ng)
 * 2. Web Speech API (browser-based, local voices)
 */
export async function detectLocalTts(): Promise<LocalTtsStatus> {
  const nativeStatus = await detectNativeTts();
  if (nativeStatus?.available) {
    return {
      available: true,
      provider: nativeStatus.provider,
      neural: nativeStatus.neural,
      message: nativeStatus.message,
    };
  }

  if (isWebSpeechAvailable()) {
    return {
      available: true,
      provider: "web_speech",
      neural: false,
      message: "Web Speech API verfügbar.",
    };
  }

  return {
    available: false,
    provider: "none",
    neural: false,
    message:
      nativeStatus?.message ??
      "Kein lokaler TTS-Provider verfügbar. Die Kurzbeschreibung bleibt sichtbar.",
  };
}

/**
 * Synchronous check for Web Speech API availability.
 * Used for quick rendering checks without async overhead.
 */
export function isSpeechSupported(): boolean {
  return isWebSpeechAvailable();
}

// ---------------------------------------------------------------------------
// Speech Control
// ---------------------------------------------------------------------------

/**
 * Speak sanitized short text through the selected local provider.
 *
 * The text is sanitized again at this boundary before it reaches any native
 * provider or the browser speech engine.
 */
export async function speakLocalText(
  text: string,
  options?: SpeakOptions,
): Promise<void> {
  await stopLocalSpeech();

  const { sanitizeForAudio } = await import("@/lib/promptAudioSummary");
  const sanitized = sanitizeForAudio(text);
  const safeText =
    sanitized.length > MAX_TTS_TEXT_LENGTH || text.length > MAX_TTS_TEXT_LENGTH
      ? sanitized.slice(0, MAX_TTS_TEXT_LENGTH - 3) + "..."
      : sanitized;
  if (!safeText.trim()) return;

  const trace = newTrace();

  // Native detection
  const nativeStatus = await detectNativeTts();
  if (trace) {
    const { endSpan } = openSpan(trace, {
      operation: "tts-engine-detection",
      layer: "typescript",
      stage: "tts.engine-detection",
      attributes: ttsAttributes(nativeStatus?.provider ?? "none", safeText.length),
    });
    endSpan("succeeded");
  }

  if (nativeStatus?.available && isTauriContext()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      isCurrentlySpeaking = true;

      const synthSpan = trace
        ? openSpan(trace, {
            operation: "tts-synthesis",
            layer: "typescript",
            stage: "tts.synthesis",
            attributes: ttsAttributes(nativeStatus.provider, safeText.length),
          })
        : null;
      if (synthSpan) synthSpan.span.inputFingerprint = contentFingerprint(safeText);

      if (nativeStatus.provider === "piper") {
        const bytes = await invoke<number[]>("synthesize_piper", {
          text: safeText,
        });
        await playPiperAudio(bytes);
        synthSpan?.endSpan("succeeded");
        if (trace) recordCompletedTrace(trace, "succeeded");
        return;
      }

      if (
        nativeStatus.provider === "speech_dispatcher" ||
        nativeStatus.provider === "espeak_ng"
      ) {
        await invoke("speak_system_tts", {
          provider: nativeStatus.provider,
          text: safeText,
        });
        isCurrentlySpeaking = false;
        synthSpan?.endSpan("succeeded");
        if (trace) recordCompletedTrace(trace, "succeeded");
        return;
      }
    } catch (error) {
      isCurrentlySpeaking = false;
      if (error instanceof Error && error.message.includes("gestoppt")) {
        if (trace) {
          const { endSpan } = openSpan(trace, {
            operation: "tts-cancel",
            layer: "typescript",
            stage: "tts.cancel",
          });
          endSpan("succeeded", { reasonCode: "TTS_CANCELLED" });
          recordCompletedTrace(trace, "succeeded");
        }
        return;
      }
      if (nativeStatus.provider === "piper") {
        const { invoke: invokeFallback } = await import("@tauri-apps/api/core");
        for (const fallbackProvider of ["speech_dispatcher", "espeak_ng"] as const) {
          try {
            await invokeFallback("speak_system_tts", {
              provider: fallbackProvider,
              text: safeText,
            });
            return;
          } catch {
            // Try the next local provider before falling back to Web Speech.
          }
        }
      }
      // A native provider failure must not remove the browser fallback.
      if (!isWebSpeechAvailable()) {
        if (trace) {
          const { endSpan } = openSpan(trace, {
            operation: "tts-synthesis",
            layer: "typescript",
            stage: "tts.synthesis",
          });
          endSpan("failed", { reasonCode: "TTS_SYNTHESIS_FAILED" });
          recordCompletedTrace(trace, "failed");
        }
        throw error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  // Web Speech remains the browser and native-runtime fallback.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof window === "undefined" || !window.speechSynthesis) {
    if (trace) {
      const { endSpan } = openSpan(trace, {
        operation: "tts-synthesis",
        layer: "typescript",
        stage: "tts.synthesis",
      });
      endSpan("failed", { reasonCode: "TTS_ENGINE_NOT_FOUND" });
      recordCompletedTrace(trace, "failed");
    }
    return;
  }

  const webSpan = trace
    ? openSpan(trace, {
        operation: "tts-playback",
        layer: "typescript",
        stage: "tts.playback",
        attributes: ttsAttributes("web_speech", safeText.length),
      })
    : null;
  if (webSpan) webSpan.span.inputFingerprint = contentFingerprint(safeText);

  await new Promise<void>((resolve, reject) => {
    try {
      const synth = window.speechSynthesis;
      const utterance = new SpeechSynthesisUtterance(safeText);
      utterance.lang = options?.language ?? "de-DE";
      utterance.rate = options?.rate ?? 0.9;
      const voices = synth.getVoices();
      utterance.voice =
        voices.find((voice) => voice.lang.startsWith("de")) ??
        voices.find((voice) => voice.lang.startsWith("en")) ??
        null;
      utterance.onstart = () => {
        isCurrentlySpeaking = true;
      };
      utterance.onend = () => {
        isCurrentlySpeaking = false;
        webSpan?.endSpan("succeeded");
        if (trace) recordCompletedTrace(trace, "succeeded");
        resolve();
      };
      utterance.onerror = (event) => {
        isCurrentlySpeaking = false;
        if (event.error === "canceled" || event.error === "interrupted") {
          webSpan?.endSpan("succeeded", { reasonCode: "TTS_CANCELLED" });
          if (trace) recordCompletedTrace(trace, "succeeded");
          resolve();
        } else {
          webSpan?.endSpan("failed", { reasonCode: "TTS_SYNTHESIS_FAILED" });
          if (trace) recordCompletedTrace(trace, "failed");
          reject(new Error(event.error));
        }
      };
      synth.speak(utterance);
    } catch (error) {
      isCurrentlySpeaking = false;
      webSpan?.endSpan("failed", { reasonCode: "TTS_SYNTHESIS_FAILED" });
      if (trace) recordCompletedTrace(trace, "failed");
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * Stop browser audio and any active native TTS process.
 */
export async function stopLocalSpeech(): Promise<void> {
  const hadActive = activeAudio !== null || hasWebSpeechActive();

  releaseActiveAudio();
  await invokeNativeStop();

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof window !== "undefined" && window.speechSynthesis) {
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) synth.cancel();
  }
  isCurrentlySpeaking = false;

  if (hadActive && isObservabilityEnabled()) {
    const trace = createTrace("tts-stop");
    const { endSpan } = openSpan(trace, {
      operation: "tts-cancel",
      layer: "typescript",
      stage: "tts.cancel",
    });
    endSpan("succeeded", { reasonCode: "TTS_CANCELLED" });
    recordCompletedTrace(trace, "succeeded");
  }

  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

/**
 * Check if speech is currently playing.
 */
export function isSpeaking(): boolean {
  return isCurrentlySpeaking;
}

/**
 * Returns the current speaking state for React components.
 * Use this in event handlers for state updates.
 */
export function getIsSpeaking(): boolean {
  return isCurrentlySpeaking;
}
