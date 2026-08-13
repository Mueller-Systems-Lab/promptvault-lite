import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { createPromptAudioSummary } from "@/lib/promptAudioSummary";
import {
  detectLocalTts,
  speakLocalText,
  stopLocalSpeech,
} from "@/lib/localTts";
import type { LocalTtsStatus } from "@/lib/localTts";
import type { PromptAudioSummaryResult } from "@/lib/promptAudioSummary";

// ---------------------------------------------------------------------------
// PromptAudioSummary Component
// Issue #200: Audio-Kurzbeschreibung für ausgewählte Prompts
//
// Renders a safe short German summary of the selected prompt in the
// detail view. Provides a "Kurz vorlesen" / "Stoppen" button that
// speaks the summary using local TTS (Web Speech API).
// ---------------------------------------------------------------------------

/**
 * PromptAudioSummary
 *
 * Reads the selected prompt and its analysis data from the store,
 * generates a safe audio summary, and renders it with a speak/stop button.
 *
 * - Always shows the text summary (even if TTS is unavailable)
 * - "Kurz vorlesen" button starts TTS if available
 * - "Stoppen" button cancels current speech
 * - Blocked content (canSpeak=false) shows the summary but no audio button
 * - ARIA labels for accessibility
 * - Cleans up speech on unmount
 */
export const PromptAudioSummary: React.FC = () => {
  const prompt = useAppStore((s) => s.selectedPrompt)();
  const evaluation = useAppStore((s) => s.selectedEvaluation)();
  const hygiene = useAppStore((s) => s.selectedHygiene)();
  const blueprintDetection = useAppStore((s) => s.selectedBlueprintDetection)();
  const blueprintEvaluation = useAppStore(
    (s) => s.selectedBlueprintEvaluation,
  )();

  const [summary, setSummary] = useState<PromptAudioSummaryResult | null>(null);
  const [ttsStatus, setTtsStatus] = useState<LocalTtsStatus | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);

  // Track if component is still mounted (for async state updates)
  const mountedRef = useRef(true);

  // Sequence guard: only the latest speak/stop operation may update isPlaying,
  // preventing a stale speak's finally from clobbering a newer speak.
  const speakSeqRef = useRef(0);

  // -----------------------------------------------------------------------
  // Detect TTS availability on mount
  // -----------------------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;

    void (async () => {
      try {
        const status = await detectLocalTts();
        if (mountedRef.current) {
          setTtsStatus(status);
        }
      } catch {
        if (mountedRef.current) {
          setTtsStatus({
            available: false,
            provider: "none",
            message: "TTS-Erkennung fehlgeschlagen.",
          });
        }
      }
    })();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // -----------------------------------------------------------------------
  // Generate summary when the selected prompt changes
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!prompt) {
      setSummary(null);
      return;
    }

    const result = createPromptAudioSummary({
      prompt,
      evaluation,
      hygiene,
      blueprintDetection,
      blueprintEvaluation,
    });

    setSummary(result);
  }, [prompt, evaluation, hygiene, blueprintDetection, blueprintEvaluation]);

  // -----------------------------------------------------------------------
  // Stop speech when the selected prompt changes or component unmounts
  // -----------------------------------------------------------------------

  useEffect(() => {
    // Stop any playing speech when prompt changes
    setIsPlaying(false);
    setTtsError(null);
    void stopLocalSpeech();

    return () => {
      void stopLocalSpeech();
    };
  }, [prompt?.id]);

  // Always stop on unmount
  useEffect(() => {
    return () => {
      void stopLocalSpeech();
      mountedRef.current = false;
    };
  }, []);

  // -----------------------------------------------------------------------
  // Speak / Stop handlers
  // -----------------------------------------------------------------------

  const handleSpeak = useCallback(async () => {
    if (!summary?.text || !summary.canSpeak) return;

    const seq = ++speakSeqRef.current;
    setTtsError(null);
    setIsPlaying(true);

    try {
      await speakLocalText(summary.text, { language: "de-DE" });
    } catch (err) {
      if (seq === speakSeqRef.current) {
        setTtsError(
          err instanceof Error ? err.message : "Fehler bei der Sprachausgabe.",
        );
      }
    } finally {
      if (seq === speakSeqRef.current && mountedRef.current) {
        setIsPlaying(false);
      }
    }
  }, [summary]);

  const handleStop = useCallback(async () => {
    speakSeqRef.current += 1;
    await stopLocalSpeech();
    if (mountedRef.current) {
      setIsPlaying(false);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (!prompt || !summary) {
    return null;
  }

  const ttsAvailable = ttsStatus?.available ?? false;
  const canSpeak = summary.canSpeak && ttsAvailable;

  return (
    <div
      className="audio-summary"
      role="region"
      aria-label="Audio-Kurzbeschreibung"
    >
      {/* Summary text */}
      <div className="audio-summary-text" aria-live="polite">
        {summary.text}
      </div>

      {/* Audio controls */}
      {canSpeak && !isPlaying && (
        <button
          className="btn btn-audio"
          onClick={() => {
            void handleSpeak();
          }}
          aria-label="Kurzbeschreibung vorlesen"
          title="Kurzbeschreibung vorlesen"
        >
          🔊 Kurz vorlesen
        </button>
      )}

      {canSpeak && isPlaying && (
        <button
          className="btn btn-audio btn-audio-stop"
          onClick={() => {
            void handleStop();
          }}
          aria-label="Sprachausgabe stoppen"
          title="Sprachausgabe stoppen"
        >
          ⏹ Stoppen
        </button>
      )}

      {/* TTS unavailable message */}
      {!ttsAvailable && summary.canSpeak && (
        <div className="audio-summary-note" role="note">
          {ttsStatus?.message ??
            "Kein TTS-Provider verfügbar – Kurzbeschreibung kann nicht vorgelesen werden."}
        </div>
      )}

      {/* Blocked message */}
      {!summary.canSpeak && (
        <div
          className="audio-summary-blocked"
          role="alert"
          aria-live="assertive"
        >
          🔒 Audioausgabe aus Sicherheitsgründen deaktiviert.
        </div>
      )}

      {/* TTS error */}
      {ttsError && (
        <div className="audio-summary-error" role="alert">
          Fehler: {ttsError}
        </div>
      )}
    </div>
  );
};

export default PromptAudioSummary;
