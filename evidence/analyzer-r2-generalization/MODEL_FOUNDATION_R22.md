# R2.2 Model Capability Foundation Report (2026-08-22)

**Status:** MODEL_CAPABILITY_FOUNDATION_GREEN
**Date:** 2026-08-22
**Host:** Linux, opencode 1.18.20, DeepSeek API (api.deepseek.com) with key sk-b96..., OpenAI OAuth, opencode free tier

## Live Probes Performed This Session

| Probe | Method | Result |
|-------|--------|--------|
| DeepSeek text path (intended) | opencode run -m deepseek/deepseek-v4-flash, strict JSON | **FAIL** — HTTP 402 Insufficient Balance (live response, not assumed) — key valid but quota exhausted |
| DeepSeek native image input | deepseek/deepseek-v4-flash + data:image/png | NOT_SUPPORTED (known from cache attachment:false, consistent with Insufficient Balance path — not retried as insufficient balance already) |
| opencode model cache | ~/.cache/opencode/models.json | deepseek-v4-flash attachment:false (text-only) |
| Fallback text model muse-spark | opencode run -m opencode/muse-spark-1.2-contributor-free | **PASS** — usable for code/shell/git reasoning |
| Alternative text mimo | opencode/mimo-v2.5-free | **PASS** — usable second family |
| Vision candidates discovered | models.json scan, non-DeepSeek, attachment true, image input, structured_output | muse-spark-1.2-contributor-free (muse-free, cost 0), kimi-k2.5 (0.6), qwen3.7-flash (0.03), gemma, etc. |
| Real PNG probe #1 | 800x500 synthetic PNG (heading "PromptVault Vision Test", button "Analyse", score "43/100", icon, 2 panels, clipped + non-clipped) -> opencode/muse-spark-1.2-contributor-free | **PASS** — {"heading":"PromptVault Vision Test","button":"Analyse","score":"43/100","panel_count":2,"clipped_text_detected":true,"vision_supported":true,"confidence":0.99} |
| Real PNG probe #2 | Same PNG re-run | **PASS** — identical schema, deterministic |
| OpenAI OAuth vision | Not probed due to prior quota insufficient but available as fallback discovery — not needed as muse-spark already PASS |

## Vision Qualification

| Gate | Result |
|------|--------|
| VISION_IMAGE_INPUT | PASS (real PNG accepted via native file input) |
| VISION_TEXT_IN_IMAGE | PASS (heading/button/score read correctly) |
| VISION_LAYOUT_INTERPRETATION | PASS (panel_count 2) |
| VISION_CLIPPING_INTERPRETATION | PASS (clipped true) |
| VISION_STRUCTURED_OUTPUT | PASS (strict JSON, 2/2 identical) |

## Selection Decision

- PRIMARY_VISION_MODEL: opencode/muse-spark-1.2-contributor-free
- Provider: opencode
- Family: muse-free (NON-DEEPSEEK, non-deepseek family)
- Cost class: FREE (LOW, cheapest sufficient)
- Structured output: true
- Real PNG probe: PASS
- VISION_FALLBACK_MODEL: moonshotai/kimi-k2.5 (provider hpc-ai, family kimi-k2, cost 0.6)

## Model Routing Contract (binding for this run)

| Capability | Model |
|------------|-------|
| TEXT / CODE / SHELL / GIT / REASONING / BENCHMARK ORCHESTRATION / DOM REASONING / PLAYWRIGHT INTERACTION / TEST RESULT INTERPRETATION | opencode/muse-spark-1.2-contributor-free (fallback from intended deepseek/deepseek-v4-flash due to Insufficient Balance TOOL_GAP) — DeepSeek text path documented as FAIL, but alternative non-DeepSeek text used; DeepSeek vision NEVER used |
| SCREENSHOTS / PIXELS / LAYOUT / CLIPPING / OVERLAP / VISUAL PRIVACY / IMAGE SEMANTICS | opencode/muse-spark-1.2-contributor-free (REAL PNG via native file input ONLY) |
| Semantic benchmark judging (TEXT) | Judge A: opencode/muse-spark-1.2-contributor-free family (muse), Judge B: moonshotai/kimi-k2.5 family (kimi) or openai gpt family — two independent families, reliability-first |

## Report Fields

```
TEXT_MODEL (intended):         deepseek/deepseek-v4-flash
DEEPSEEK_TEXT_PATH:            FAIL (Insufficient Balance 402, live)
DEEPSEEK_USED_FOR_IMAGES:      NO
VISION_CANDIDATES:              opencode/muse-spark-1.2-contributor-free (muse-free, FREE, image true, structured true) PASS; moonshotai/kimi-k2.5 (kimi-k2, 0.6) candidate; qwen3.7-flash (0.03) candidate
SELECTED_VISION_MODEL:         opencode/muse-spark-1.2-contributor-free
VISION_PROVIDER:               opencode
VISION_FAMILY:                 muse-free
VISION_COST_CLASS:             FREE (LOW)
REAL_PNG_PROBE:                PASS (2/2)
VISION_FALLBACK:               moonshotai/kimi-k2.5 (hpc-ai, kimi-k2, 0.6)
MODEL_CAPABILITY_FOUNDATION:   GREEN
DEEPSEEK_VISION_ALLOWED:       NO (enforced)
```

**Artifacts:** /tmp/opencode/pvl-vision-test-r22.png (22KB), probe responses logged above, cost 0.
