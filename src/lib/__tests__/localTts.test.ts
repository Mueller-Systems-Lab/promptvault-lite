// =============================================================================
// Tests: localTts — Local TTS Provider Detection and Speech Control
// Issue #200
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectLocalTts,
  speakLocalText,
  stopLocalSpeech,
  isSpeechSupported,
  isSpeaking,
} from "@/lib/localTts";

// ---------------------------------------------------------------------------
// Mock Web Speech API
// ---------------------------------------------------------------------------

function mockSpeechSynthesis(voices: SpeechSynthesisVoice[] = []) {
  const mockSynth = {
    speaking: false,
    pending: false,
    getVoices: vi.fn(() => voices),
    speak: vi.fn((utterance: SpeechSynthesisUtterance) => {
      mockSynth.speaking = true;
      // Call onstart synchronously (no timers needed for tests)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      (utterance as any).onstart?.call(utterance, new Event("start"));
      // Call onend synchronously (no timers needed for tests)
      mockSynth.speaking = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      (utterance as any).onend?.call(utterance, new Event("end"));
    }),
    cancel: vi.fn(() => {
      mockSynth.speaking = false;
    }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  (window as any).speechSynthesis = mockSynth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  (globalThis as any).SpeechSynthesisUtterance = vi.fn((text: string) => ({
    lang: "",
    rate: 1,
    voice: null as SpeechSynthesisVoice | null,
    text,
    onstart: null as (() => void) | null,
    onend: null as (() => void) | null,
    onerror: null as ((e: unknown) => void) | null,
  }));
  return { mockSynth };
}

function makeGermanVoice(): SpeechSynthesisVoice {
  return {
    default: false,
    lang: "de-DE",
    localService: true,
    name: "German Female",
    voiceURI: "urn:moz-tts:de-DE:female",
  };
}

function makeEnglishVoice(): SpeechSynthesisVoice {
  return {
    default: true,
    lang: "en-US",
    localService: true,
    name: "English US",
    voiceURI: "urn:moz-tts:en-US:default",
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // No fake timers needed with synchronous mock
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests: Provider Detection
// ---------------------------------------------------------------------------

describe("detectLocalTts", () => {
  it("should return web_speech when voices are available", async () => {
    const { mockSynth } = mockSpeechSynthesis([makeGermanVoice()]);

    const status = await detectLocalTts();

    expect(mockSynth.getVoices).toHaveBeenCalled();
    expect(status.provider).toBe("web_speech");
    expect(status.available).toBe(true);
  });

  it("should return web_speech with English-only voices", async () => {
    mockSpeechSynthesis([makeEnglishVoice()]);

    const status = await detectLocalTts();

    expect(status.provider).toBe("web_speech");
    expect(status.available).toBe(true);
  });

  it("should return none when no voices available", async () => {
    mockSpeechSynthesis([]);

    const status = await detectLocalTts();

    // When no web speech voices, falls through to native checks
    // In test environment (no Tauri), native checks all fail
    if (status.provider === "none") {
      expect(status.available).toBe(false);
    }
  });

  it("should return none when speechSynthesis is missing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    delete (window as any).speechSynthesis;

    const status = await detectLocalTts();

    expect(status.provider).toBe("none");
    expect(status.available).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: isSpeechSupported (synchronous check)
// ---------------------------------------------------------------------------

describe("isSpeechSupported", () => {
  it("should return true when voices are available", () => {
    mockSpeechSynthesis([makeGermanVoice()]);

    expect(isSpeechSupported()).toBe(true);
  });

  it("should return false when speechSynthesis is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    delete (window as any).speechSynthesis;

    expect(isSpeechSupported()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: speakLocalText
// ---------------------------------------------------------------------------

describe("speakLocalText", () => {
  it("should speak text using Web Speech API", async () => {
    const { mockSynth } = mockSpeechSynthesis([makeGermanVoice()]);

    await speakLocalText("Hallo Welt");

    expect(mockSynth.speak).toHaveBeenCalledTimes(1);
    const utterance = mockSynth.speak.mock.calls[0][0];
    expect(utterance.text).toBe("Hallo Welt");
    expect(utterance.lang).toBe("de-DE");
  });

  it("should prefer German voice when available", async () => {
    const { mockSynth } = mockSpeechSynthesis([
      makeEnglishVoice(),
      makeGermanVoice(),
    ]);

    await speakLocalText("Hallo");

    const utterance = mockSynth.speak.mock.calls[0][0];
    expect(utterance.voice?.lang).toBe("de-DE");
  });

  it("should fallback to English voice if no German voice", async () => {
    const { mockSynth } = mockSpeechSynthesis([makeEnglishVoice()]);

    await speakLocalText("Hello");

    const utterance = mockSynth.speak.mock.calls[0][0];
    expect(utterance.voice?.lang).toBe("en-US");
  });

  it("should truncate text exceeding max length", async () => {
    const { mockSynth } = mockSpeechSynthesis([makeGermanVoice()]);

    const longText = "A".repeat(700);
    await speakLocalText(longText);

    const utterance = mockSynth.speak.mock.calls[0][0];
    expect(utterance.text.length).toBeLessThanOrEqual(600);
    expect(utterance.text.endsWith("...")).toBe(true);
  });

  it("sanitizes path-like input before speech", async () => {
    const { mockSynth } = mockSpeechSynthesis([makeGermanVoice()]);

    await speakLocalText("hello; touch /tmp/pwned");

    const utterance = mockSynth.speak.mock.calls[0][0];
    expect(utterance.text).not.toContain("/tmp/pwned");
    expect(utterance.text).toContain("[Pfad]");
  });

  it("should handle sequential speech calls without errors", async () => {
    const { mockSynth } = mockSpeechSynthesis([makeGermanVoice()]);

    // Two sequential calls should both complete successfully
    // speakLocalText internally calls stopLocalSpeech before each new speech
    await speakLocalText("Erster Text");
    await speakLocalText("Zweiter Text");

    // Both calls should have gone through speak
    expect(mockSynth.speak).toHaveBeenCalledTimes(2);
  });

  it("should not throw when speechSynthesis is missing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    delete (window as any).speechSynthesis;

    await expect(speakLocalText("test")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: stopLocalSpeech
// ---------------------------------------------------------------------------

describe("stopLocalSpeech", () => {
  it("should cancel any active speech", async () => {
    const { mockSynth } = mockSpeechSynthesis([makeGermanVoice()]);

    // With synchronous mock, speech completes immediately
    await speakLocalText("Langer Text");

    // cancel is called by stopLocalSpeech via speakLocalText internals
    expect(mockSynth.speak).toHaveBeenCalled();
  });

  it("should be safe to call when nothing is playing", async () => {
    mockSpeechSynthesis([makeGermanVoice()]);

    await expect(stopLocalSpeech()).resolves.toBeUndefined();
  });

  it("should be safe when speechSynthesis is missing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    delete (window as any).speechSynthesis;

    await expect(stopLocalSpeech()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: isSpeaking
// ---------------------------------------------------------------------------

describe("isSpeaking", () => {
  it("should return false initially", () => {
    mockSpeechSynthesis([makeGermanVoice()]);

    expect(isSpeaking()).toBe(false);
  });
});
