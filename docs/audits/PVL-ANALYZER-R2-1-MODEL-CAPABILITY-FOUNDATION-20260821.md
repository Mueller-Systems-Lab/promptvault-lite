# PVL — Analyzer R2.1 Cleanroom — Model Capability Foundation Report (2026-08-21)

**Status:** MODEL_CAPABILITY_FOUNDATION_GREEN
**Date:** 2026-08-21
**Host:** Linux, opencode 1.18.20, DeepSeek API (api.deepseek.com), OpenAI OAuth (quota-blocked)

---

## 1. Live probes performed this session

| Probe | Method | Result |
|---|---|---|
| DeepSeek text path | Direct chat completion `deepseek-v4-flash`, strict JSON request | **PASS** — returned `{"model_ok":true,"mode":"text"}`, latency ~13 s (reasoning model) |
| DeepSeek native image input | `deepseek-v4-flash` + `data:image/png` message | **NOT_SUPPORTED** — HTTP 400 `"This model does not support image"` (live rejection, not assumed) |
| opencode model cache | `~/.cache/opencode/models.json` | `deepseek-v4-flash` attachment: False, `deepseek-v4-pro` attachment: False (text-only per cache) |
| Vision model discovery | `GET https://api.deepseek.com/models` (live) | Catalog lists: `deepseek-v4-flash`, `deepseek-v4-pro`, **`deepseek-v4-flash-vision-exp`** |
| Real PNG probe #1 | 800×500 synthetic PNG (heading "PromptVault Vision Test", button "Analyse", score "43/100", icon, 2 colored regions) → `deepseek-v4-flash-vision-exp` | **PASS** — `{"heading":"PromptVault Vision Test","button_text":"Analyse","score_text":"43/100","regions":2,"vision_supported":true,"confidence":1.0}` |
| Real PNG probe #2 | Same PNG, same model | **PASS** — byte-identical JSON (deterministic) |
| OpenAI OAuth | Live chat completion `gpt-4o-mini` | **FAIL (unusable)** — HTTP 429 `insufficient_quota` |
| opencode free-tier | `opencode run -m opencode/nemotron-3.5-lightning-free` | **PASS** — usable second model family (for judge independence in Phase 12) |

## 2. Vision qualification

| Gate | Result |
|---|---|
| VISION_IMAGE_INPUT | **PASS** (real PNG accepted via native image_url input) |
| VISION_SEMANTIC_INTERPRETATION | **PASS** (heading, button text, score text, region count all read correctly from pixels) |
| VISION_STRUCTURED_OUTPUT | **PASS** (exact strict JSON schema, 2/2 byte-identical) |

`deepseek-v4-flash-vision-exp` reads the actual image — not OCR/extracted text: the probe demanded heading/button/score/region count from rendered pixels and all matched exactly.

## 3. Selection decision

- **PRIMARY_VISION_MODEL: `deepseek-v4-flash-vision-exp`** (DeepSeek, api.deepseek.com)
- **Why:** cheapest sufficient verified model. Same cost tier as default text model (per previous verified pricing record: $0.22 input / $0.66 output per 1M off-peak — same class as `deepseek-v4-flash`). Only vision-capable model whose native image capability is LIVE-PROVEN this session.
- **VISION_FALLBACK_MODEL:** none verified live (OpenAI quota-blocked; no other verified image-capable provider configured). Escalation path documented: one transient retry → escalate to stronger verified model (none available now; will be recorded as TOOL_GAP if needed).

## 4. Model routing contract (binding for this run)

| Capability | Model |
|---|---|
| TEXT / CODE / REASONING / DOM / ARIA / CONSOLE / NETWORK / STRUCTURED TEST DATA | `deepseek/deepseek-v4-flash` |
| SCREENSHOTS / PIXELS / LAYOUT / CLIPPING / OVERLAP / VISUAL PRIVACY / IMAGE SEMANTICS | `deepseek-v4-flash-vision-exp` (REAL PNG via native image input ONLY) |
| Semantic benchmark judging (TEXT) | Judge A: DeepSeek family (`deepseek-v4-pro`); Judge B: opencode free-tier (nemotron family) — two independent families |

## 5. Report fields

```
DEFAULT_TEXT_MODEL:              deepseek/deepseek-v4-flash
DEEPSEEK_TEXT_PROBE:             PASS
DEEPSEEK_NATIVE_IMAGE_INPUT:     NOT_SUPPORTED (live 400 rejection)
VISION_CANDIDATES_DISCOVERED:    deepseek-v4-flash-vision-exp (DeepSeek);
                                 OpenAI models listed but quota-blocked (unusable)
VISION_CANDIDATES_TESTED:        deepseek-v4-flash-vision-exp (1 PNG, 2 runs)
SELECTED_VISION_MODEL:           deepseek-v4-flash-vision-exp
VISION_PROVIDER:                 deepseek (api.deepseek.com)
VISION_COST_CLASS:               LOW (identical to default text model)
VISION_REAL_PNG_PROBE:           PASS (2/2 exact schema)
VISION_FALLBACK_MODEL:           none verified live (TOOL_GAP if escalation needed)
PLAYWRIGHT_DOM_MODEL:            deepseek/deepseek-v4-flash
PLAYWRIGHT_VISUAL_MODEL:         deepseek-v4-flash-vision-exp
MODEL_CAPABILITY_FOUNDATION:     GREEN
```

**Artifacts:** `/tmp/opencode/pvl-vision-probe.png` (synthetic probe image), `/tmp/opencode/pvl-vision-probe-payload2.json` (probe payload), probe responses recorded in this report.
