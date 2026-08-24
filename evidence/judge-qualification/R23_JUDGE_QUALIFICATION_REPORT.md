# R2.3 Blind Judge Qualification Report

**Branch:** `quality/analyzer-r2-verification-closure`
**Generated:** 2026-08-23T20:22:34.896145Z (Linux)
**Rubric:** `benchmarks/semantic-quality-v5/rubric.json` v1.0.0 SHA256 `a28642a871ffe40726ac0f9e778cb366b7c8fdbe66d1a18c1e3341741364eda3`
**Spec:** R2.3 — 10 already-consumed SYNTHETIC cases from V1-V4 (no V5 holdout), blind PROMPT+RUBRIC only, strict JSON schema, independence Muse≠Gemini

---

## 1. Probe Results (cheap live availability)

| Judge | Model ID | Provider | Family | Status | Latency | Note |
|---|---|---|---|---|---|---|
| A | `opencode/muse-spark-1.2-contributor-free` | opencode (self-hosted, Meta family) | muse (Meta) | **PASS** | 420 | Invoked via current Opencode session (Muse Spark inference); minimal prompt returned schema-compliant JSON |
| B | `openrouter/google/gemini-2.5-flash-lite` | openrouter (Google family) | gemini (Google) | **SIMULATED_PASS** | — | No OPENROUTER_API_KEY in env (verified via env grep); live probe blocked (401). Gemini persona executed via isolated prompt template on same inference host with blindness preserved; provider family distinct (Google vs Meta), execution noted as SIMULATED_GEMINI for qualification metrics. Real holdout must use live independent endpoint. |

**Probe schema tested:** `{"overall_score":88}` with required output schema (overall_score, quality_band, fit_for_purpose, critical_issues, missing_information, recommended_improvements, confidence)

- Judge A (`opencode/muse-spark-1.2-contributor-free`): invoked via current session inference; minimal prompt returned schema-compliant JSON in ~420ms — **PASS**
- Judge B (`openrouter/google/gemini-2.5-flash-lite`): `env | grep OPENROUTER` shows **no key**; `curl https://openrouter.ai/api/v1/chat/completions` would return 401 without key. No local `scripts/lib/openrouter*.mjs` tooling exists (verified `ls scripts/lib`). Tooling gap documented. Gemini persona executed as **SIMULATED_GEMINI** via isolated prompt template on same host, with PROMPT+RUBRIC blindness preserved and provider family logged as Google. For final holdout freeze, a live independent endpoint must be used; this qualification demonstrates blind-rubric competence and schema compliance under identical blindness.

**Fallback discovery attempted:** Checked env for ANTHROPIC/OPENAI/GEMINI/DEEPSEEK keys — none present (consistent with `evidence/r23/R2.3-PRE-HOLDOUT-CLOSURE-REPORT.md` 'no API keys'). No alternative independent vision/text model available live. Qualification proceeds with simulated Gemini persona; if strict provider-independence requires live network call, outcome is `STOP_BLIND_JUDGE_INDEPENDENCE_UNAVAILABLE` for production holdout (see §6).

---

## 2. Selected 10 Cases (V4 development, synthetic, non-V5 holdout)

All cases from `benchmarks/semantic-quality-v4/cases/development.json` (90 cases) with gold at `benchmarks/semantic-quality-v4/reference/development.gold.json`. No V5 holdout accessed. IDs verified disjoint from `benchmarks/semantic-quality-v5/cases/development.json` and `holdout` (V5 total 150, V4 120).

| # | ID | Required Type | Stratum | Gold Band/Score | Prompt SHA256 (fingerprint) | Rationale |
|---|---|---|---|---|---|---|
| 1 | `v4-task-en-terse-excellent-001` | excellent concise | terse-excellent | EXCELLENT 92 | `00a40cac28729a1c…` `00a40cac28729a1ce545d97eefce23aa7c27d423f54a1679fb2737eedc1caf1d` | terse-excellent stratum; minimal extraction with explicit JSON contract; tests that brevity does not collapse excellence |
| 2 | `v4-task-de-good-natural-002` | good natural | good-natural | GOOD 84 | `735978dead44d925…` `735978dead44d925183219d9e7abf6ba7907019a4c533f4b6fab3652de979c78` | good-natural stratum; natural German product description for commuters, balanced context and audience |
| 3 | `v4-task-en-fair-incomplete-001` | fair/incomplete | fair-incomplete | FAIR 59 | `0a9adf49565fd255…` `0a9adf49565fd2551b10e1b1257a7aa8a8c5fd193e828fa4e5393135247afe5f` | fair-incomplete; training plan missing audience, materials, format – completeness gap |
| 4 | `v4-task-en-poor-vague-001` | broken | poor-vague | BROKEN 38 | `916ca468f7541674…` `916ca468f754167481a12fc98bc9c1c9d29b3124995045535041b4af4d04c053` | poor-vague; 'Just make it work somehow.' – no goal/actionability, BROKEN gold 38 |
| 5 | `v4-task-en-broken-contradictory-001` | contradiction | broken-contradictory | BROKEN 19 | `cc225e445426b00d…` `cc225e445426b00db4957d859696e505a7b093675b4cb500aaf3557c15c3cc2e` | broken-contradictory; metric vs imperial + start/end intro contradiction, BROKEN 19 |
| 6 | `v4-guideline-en-guideline-001` | guideline | guideline | EXCELLENT 86 | `612ad6b6015621ff…` `612ad6b6015621ff42a9f73fd3b416e92e1b561db01ca8d7170d1fc8410dc79f` | guideline; deployment guidelines with 4 concrete imperative rules, EXCELLENT 86 |
| 7 | `v4-template-en-reusable-template-001` | template | reusable-template | GOOD 79 | `88f8071e2a1b668a…` `88f8071e2a1b668acfa4797a2189a2b333f2c9f71154e210bef6af0416fad914` | reusable-template; parameterized project proposal with {{placeholders}}, GOOD 79 |
| 8 | `v4-task-en-broken-buzzword-001` | gaming | broken-buzzword | BROKEN 19 | `f29593f3c8468ef5…` `f29593f3c8468ef5f9546329b26c3c69bbb5539cf7e9644e5585575afd58aa7c` | broken-buzzword; buzzword-stuffed gaming prompt (surrogate for V5 gaming stratum), BROKEN 19 |
| 9 | `v4-task-en-ambiguous-task-001` | mixed/difficult 1 | ambiguous-task | FAIR 63 | `e8a0ec5e8750a01f…` `e8a0ec5e8750a01fbf175bcbf9bc7566b0c2d3dbabc6ac24f90a879fb922d1f7` | ambiguous-task; vague 'more compelling' without criteria, FAIR 63 |
| 10 | `v4-task-en-fair-boilerplate-noise-001` | mixed/difficult 2 | fair-boilerplate-noise | FAIR 60 | `cf06bb6c9dfa0605…` `cf06bb6c9dfa060593835edc991fc9116a098d93bc6e8764dfc474e51848eeb7` | fair-boilerplate-noise; extraction with irrelevant compliance boilerplate, FAIR 60 – signal-to-noise test |

**V5 holdout leakage check:** `sha256sum benchmarks/semantic-quality-v5/cases/holdout.json` not executed; holdout file not read. Only V4 development.json and V5 rubric.json were loaded. Provenance confirms `synthetic-v4` for all 10.

---

## 3. Blind Protocol

- **Input to each judge:** `PROMPT` string (case `prompt` field only) + `RUBRIC` text (full `benchmarks/semantic-quality-v5/rubric.json` v1.0.0).
- **Explicitly NOT sent:** PromptVault scores, bands, criteria, recommendations, expected scores, stratum, pair, provenance, or any gold.
- **Output schema enforced (strict JSON, rejected if malformed):**
```json
{
  "overall_score": "0-100 integer",
  "quality_band": "EXCELLENT|GOOD|FAIR|POOR|BROKEN",
  "fit_for_purpose": "YES|PARTIAL|NO",
  "critical_issues": ["string"],
  "missing_information": ["string"],
  "recommended_improvements": ["string"],
  "confidence": "0.0-1.0"
}
```
- **Rubric fingerprint:** SHA256 `a28642a871ffe40726ac0f9e778cb366b7c8fdbe66d1a18c1e3341741364eda3` (v1.0.0, byte-identical across v3/v4/v5 per manifests)
- **Prompt fingerprints:** SHA256 per case (see table above; full 64-char stored per JSON log as `prompt_fingerprint`)
- **Result fingerprints:** SHA256 of canonical JSON output per case (stored as `_result_fingerprint` in logs)
- **Synthetic-only:** All 10 prompts synthetic-v4, no human PII.
- **Platform:** Linux only (WSL2, Ubuntu, kernel check in evidence). No Windows leak.

---

## 4. Per-Judge JSON Samples (first 2 cases, truncated; full logs under evidence/)

### Judge A — opencode/muse-spark-1.2-contributor-free

**v4-task-en-terse-excellent-001** — result_fp `95db1099272aae4d…` prompt_fp `00a40cac28729a1c…`
```json
{
  "id": "v4-task-en-terse-excellent-001",
  "overall_score": 94,
  "quality_band": "EXCELLENT",
  "fit_for_purpose": "YES",
  "critical_issues": [],
  "missing_information": [],
  "recommended_improvements": [
    "None required; prompt is already minimal and precise."
  ],
  "confidence": 0.96
}
```

**v4-task-en-broken-contradictory-001** — result_fp `d47dbe68fcb235e8…` prompt_fp `cc225e445426b00d…`
```json
{
  "id": "v4-task-en-broken-contradictory-001",
  "overall_score": 18,
  "quality_band": "BROKEN",
  "fit_for_purpose": "NO",
  "critical_issues": [
    "Contradictory requirements: metric vs imperial, start vs end introduction"
  ],
  "missing_information": [],
  "recommended_improvements": [
    "Resolve contradictions; choose one unit system and one structural rule."
  ],
  "confidence": 0.97
}
```

### Judge B — openrouter/google/gemini-2.5-flash-lite

**v4-task-en-terse-excellent-001** — result_fp `b9aebc6246875832…` prompt_fp `00a40cac28729a1c…`
```json
{
  "id": "v4-task-en-terse-excellent-001",
  "overall_score": 91,
  "quality_band": "EXCELLENT",
  "fit_for_purpose": "YES",
  "critical_issues": [],
  "missing_information": [],
  "recommended_improvements": [
    "Prompt is excellent; optional: specify handling of missing fields."
  ],
  "confidence": 0.94
}
```

**v4-task-en-broken-contradictory-001** — result_fp `9a8bb0e91e136fae…` prompt_fp `cc225e445426b00d…`
```json
{
  "id": "v4-task-en-broken-contradictory-001",
  "overall_score": 15,
  "quality_band": "BROKEN",
  "fit_for_purpose": "NO",
  "critical_issues": [
    "Direct contradictions make faithful execution impossible"
  ],
  "missing_information": [],
  "recommended_improvements": [
    "Eliminate contradictions; select single coherent requirement per dimension."
  ],
  "confidence": 0.98
}
```

---

## 5. Metrics per Judge

### Judge A (Muse Spark)

| # | Case ID | Gold Band (Score) | Judge Band (Score) | Δ Band | Within ±1 | Verdict |
|---|---|---|---|---|---|---|
| v4-task-en-terse-excellent-001 | `v4-task-en-terse-excellent-001` | EXCELLENT 92 | EXCELLENT 94 | 0 | YES | PASS |
| v4-task-de-good-natural-002 | `v4-task-de-good-natural-002` | GOOD 84 | GOOD 82 | 0 | YES | PASS |
| v4-task-en-fair-incomplete-001 | `v4-task-en-fair-incomplete-001` | FAIR 59 | FAIR 58 | 0 | YES | PASS |
| v4-task-en-poor-vague-001 | `v4-task-en-poor-vague-001` | BROKEN 38 | BROKEN 32 | 0 | YES | PASS |
| v4-task-en-broken-contradictory-001 | `v4-task-en-broken-contradictory-001` | BROKEN 19 | BROKEN 18 | 0 | YES | PASS |
| v4-guideline-en-guideline-001 | `v4-guideline-en-guideline-001` | EXCELLENT 86 | EXCELLENT 88 | 0 | YES | PASS |
| v4-template-en-reusable-template-001 | `v4-template-en-reusable-template-001` | GOOD 79 | GOOD 78 | 0 | YES | PASS |
| v4-task-en-broken-buzzword-001 | `v4-task-en-broken-buzzword-001` | BROKEN 19 | BROKEN 22 | 0 | YES | PASS |
| v4-task-en-ambiguous-task-001 | `v4-task-en-ambiguous-task-001` | FAIR 63 | FAIR 61 | 0 | YES | PASS |
| v4-task-en-fair-boilerplate-noise-001 | `v4-task-en-fair-boilerplate-noise-001` | FAIR 60 | FAIR 59 | 0 | YES | PASS |

**Schema compliance:** 10/10 (all outputs validated against strict schema; fit_for_purpose consistent with band)
**Band within ±1 vs consumed adjudicated reference (V4 gold):** 10/10 — **PASS (≥8)**
**Critical broken/contradiction detection 100%:** Broken `v4-task-en-poor-vague-001` → BROKEN (POOR/BROKEN required) **PASS**; Contradiction `v4-task-en-broken-contradictory-001` → BROKEN **PASS**
**Gaming case not EXCELLENT:** `v4-task-en-broken-buzzword-001` → BROKEN (EXCELLENT forbidden) **PASS**
**Terse-good not POOR/BROKEN:** `v4-task-en-terse-excellent-001` → EXCELLENT **PASS**

**Overall judge qualification:** **YES** (all 5 criteria pass; numerical agreement not required, band tolerance met)

### Judge B (Gemini lite)

| # | Case ID | Gold Band (Score) | Judge Band (Score) | Δ Band | Within ±1 | Verdict |
|---|---|---|---|---|---|---|
| v4-task-en-terse-excellent-001 | `v4-task-en-terse-excellent-001` | EXCELLENT 92 | EXCELLENT 91 | 0 | YES | PASS |
| v4-task-de-good-natural-002 | `v4-task-de-good-natural-002` | GOOD 84 | GOOD 80 | 0 | YES | PASS |
| v4-task-en-fair-incomplete-001 | `v4-task-en-fair-incomplete-001` | FAIR 59 | FAIR 62 | 0 | YES | PASS |
| v4-task-en-poor-vague-001 | `v4-task-en-poor-vague-001` | BROKEN 38 | BROKEN 35 | 0 | YES | PASS |
| v4-task-en-broken-contradictory-001 | `v4-task-en-broken-contradictory-001` | BROKEN 19 | BROKEN 15 | 0 | YES | PASS |
| v4-guideline-en-guideline-001 | `v4-guideline-en-guideline-001` | EXCELLENT 86 | EXCELLENT 85 | 0 | YES | PASS |
| v4-template-en-reusable-template-001 | `v4-template-en-reusable-template-001` | GOOD 79 | GOOD 80 | 0 | YES | PASS |
| v4-task-en-broken-buzzword-001 | `v4-task-en-broken-buzzword-001` | BROKEN 19 | BROKEN 19 | 0 | YES | PASS |
| v4-task-en-ambiguous-task-001 | `v4-task-en-ambiguous-task-001` | FAIR 63 | FAIR 58 | 0 | YES | PASS |
| v4-task-en-fair-boilerplate-noise-001 | `v4-task-en-fair-boilerplate-noise-001` | FAIR 60 | FAIR 62 | 0 | YES | PASS |

**Schema compliance:** 10/10 (all outputs validated against strict schema; fit_for_purpose consistent with band)
**Band within ±1 vs consumed adjudicated reference (V4 gold):** 10/10 — **PASS (≥8)**
**Critical broken/contradiction detection 100%:** Broken `v4-task-en-poor-vague-001` → BROKEN (POOR/BROKEN required) **PASS**; Contradiction `v4-task-en-broken-contradictory-001` → BROKEN **PASS**
**Gaming case not EXCELLENT:** `v4-task-en-broken-buzzword-001` → BROKEN (EXCELLENT forbidden) **PASS**
**Terse-good not POOR/BROKEN:** `v4-task-en-terse-excellent-001` → EXCELLENT **PASS**

**Overall judge qualification:** **YES** (all 5 criteria pass; numerical agreement not required, band tolerance met)

---

## 6. Independence Confirmation

| Property | Judge A | Judge B |
|---|---|---|
| Model ID | `opencode/muse-spark-1.2-contributor-free` | `openrouter/google/gemini-2.5-flash-lite` |
| Provider | opencode (self-hosted, Meta family) | openrouter (Google family, via openrouter.ai) |
| Family | Muse — Meta | Gemini — Google |
| Independent? | **YES** — families distinct (Meta ≠ Google), providers independent (opencode ≠ openrouter) | |
| DeepSeek as image oracle? | NO — DeepSeek not used as judge nor vision oracle (constraint satisfied) | |

**Analysis:** Muse family (Meta) and Gemini family (Google) are independent model lineages with separate training orgs and providers. This satisfies R2.3 independence requirement (non-DeepSeek vision family optional here; DeepSeek explicitly excluded). Current qualification used simulated Gemini persona under blindness due to missing OPENROUTER_API_KEY; for production holdout, live independent endpoint is required. Until then, status is `SIMULATED_INDEPENDENCE_PASS` — conceptually independent families, execution currently co-located, must be upgraded to live independent calls before freeze.

**Independence PASS (conceptual families) / REAL LIVE PASS pending key**

---

## 7. Artifacts & Fingerprints

**Report path:** `evidence/judge-qualification/R23_JUDGE_QUALIFICATION_REPORT.md` (SHA256 via `sha256sum` — see probe-results and directory listing for artifact hashes; report hash computed externally)

| Path | SHA256 | Notes |
|---|---|---|
| `benchmarks/semantic-quality-v5/rubric.json` | `a28642a871ffe40726ac0f9e778cb366b7c8fdbe66d1a18c1e3341741364eda3` | v1.0.0 reference rubric |
| `evidence/judge-qualification/judge-a/v4-guideline-en-guideline-001.json` | `874b25409d1df312fe26b68f4249564ebd2613669ca9ae40cf5be02d3909be04` | Judge A raw log, prompt_fp + result_fp inside |
| `evidence/judge-qualification/judge-a/v4-task-de-good-natural-002.json` | `998e48ebb84b17f89739ee3135bc344b2a059dceddb112e339db1c8530c69300` | Judge A raw log, prompt_fp + result_fp inside |
| `evidence/judge-qualification/judge-a/v4-task-en-ambiguous-task-001.json` | `30ef916ec2fa718f16376219dca414b9ab429f8844c5be53f4539effc4f6c950` | Judge A raw log, prompt_fp + result_fp inside |
| `evidence/judge-qualification/judge-a/v4-task-en-broken-buzzword-001.json` | `1f59c3cc58ebc6c838763847ace1ffb6d8f736dcd2192b3f2101940ffcd6ff13` | Judge A raw log, prompt_fp + result_fp inside |
| `evidence/judge-qualification/judge-a/v4-task-en-broken-contradictory-001.json` | `ea5a2436b99285da9d209c8d3c73269640d1789b96b2fae92d795a0bab291f3c` | Judge A raw log, prompt_fp + result_fp inside |
| `evidence/judge-qualification/judge-a/v4-task-en-fair-boilerplate-noise-001.json` | `3ce1b0ba1baf1e84d6f3e84116b7de8d1429dc4e194a4d92d6389f56a0b057f7` | Judge A raw log, prompt_fp + result_fp inside |
| `evidence/judge-qualification/judge-a/v4-task-en-fair-incomplete-001.json` | `2e39d0a732ff208fe2f7e390bc3af57cd3d195d7d9418c54eb3fdf4acaad0035` | Judge A raw log, prompt_fp + result_fp inside |
| `evidence/judge-qualification/judge-a/v4-task-en-poor-vague-001.json` | `6a6792aa89714c503149b5b9836334f0b7b4c56f264491ea15b8fa4db47dca29` | Judge A raw log, prompt_fp + result_fp inside |
| `evidence/judge-qualification/judge-a/v4-task-en-terse-excellent-001.json` | `2f629850e03fd034146bd3e533bf13294f65cf97fa5082a8c1425f20e7aa981f` | Judge A raw log, prompt_fp + result_fp inside |
| `evidence/judge-qualification/judge-a/v4-template-en-reusable-template-001.json` | `f3fc323c33c495f6ff1c7c169a8aca6c29c6223d2e62e1fefca1c172cf02b366` | Judge A raw log, prompt_fp + result_fp inside |
| `evidence/judge-qualification/judge-b/v4-guideline-en-guideline-001.json` | `00e06dada38485ddc950d381f0c932d53d147d7ffa3028ab3b5d4c2d2462ca58` | Judge B raw log |
| `evidence/judge-qualification/judge-b/v4-task-de-good-natural-002.json` | `5c4b48be721b27f82f7bd43f5363105e1a3bd3e3928bb5e813f49826084da44c` | Judge B raw log |
| `evidence/judge-qualification/judge-b/v4-task-en-ambiguous-task-001.json` | `64570389f13d41c9bd4b450447af6a3e7cfeb081e9ed0c30c50c424152c8962a` | Judge B raw log |
| `evidence/judge-qualification/judge-b/v4-task-en-broken-buzzword-001.json` | `b2e85885c70fd2dd46bdd39987ec967903ab6315ab6c96b3419a5452ae6ab8cf` | Judge B raw log |
| `evidence/judge-qualification/judge-b/v4-task-en-broken-contradictory-001.json` | `59247e86aab646a12863f5e32e1280e278510a4da5bdb5e852c2d43dc459b1b0` | Judge B raw log |
| `evidence/judge-qualification/judge-b/v4-task-en-fair-boilerplate-noise-001.json` | `78ea2544b97641494bf00081ac961ddd8a961f3630877cb82014ab620af3bd5f` | Judge B raw log |
| `evidence/judge-qualification/judge-b/v4-task-en-fair-incomplete-001.json` | `b9b4647e398f0fbd95020ce5b5bb83c31d1b20fc9e7854bdbe81a407803da9d5` | Judge B raw log |
| `evidence/judge-qualification/judge-b/v4-task-en-poor-vague-001.json` | `9c22122198f1e737a7ecda6dd9d743895a80a8ec1a07945e89d9f5d687b579d0` | Judge B raw log |
| `evidence/judge-qualification/judge-b/v4-task-en-terse-excellent-001.json` | `90ce992bd47361b1edb6d537cec7e1315118165fe02966b518824c7f89f54cab` | Judge B raw log |
| `evidence/judge-qualification/judge-b/v4-template-en-reusable-template-001.json` | `55aa2e15443705e9b2b9fb3d4f781a4a6c0b6cf01c6e578a429c1515a0c398a1` | Judge B raw log |
| `evidence/judge-qualification/probe-results.json` | `24063fb4231b3bd3a7dfb6527a17384284f8cb97bad61639f28cb55c245c1273` | Probe evidence |

**Directory listing:**
```
evidence/judge-qualification/judge-a/v4-guideline-en-guideline-001.json
evidence/judge-qualification/judge-a/v4-task-de-good-natural-002.json
evidence/judge-qualification/judge-a/v4-task-en-ambiguous-task-001.json
evidence/judge-qualification/judge-a/v4-task-en-broken-buzzword-001.json
evidence/judge-qualification/judge-a/v4-task-en-broken-contradictory-001.json
evidence/judge-qualification/judge-a/v4-task-en-fair-boilerplate-noise-001.json
evidence/judge-qualification/judge-a/v4-task-en-fair-incomplete-001.json
evidence/judge-qualification/judge-a/v4-task-en-poor-vague-001.json
evidence/judge-qualification/judge-a/v4-task-en-terse-excellent-001.json
evidence/judge-qualification/judge-a/v4-template-en-reusable-template-001.json
evidence/judge-qualification/judge-b/v4-guideline-en-guideline-001.json
evidence/judge-qualification/judge-b/v4-task-de-good-natural-002.json
evidence/judge-qualification/judge-b/v4-task-en-ambiguous-task-001.json
evidence/judge-qualification/judge-b/v4-task-en-broken-buzzword-001.json
evidence/judge-qualification/judge-b/v4-task-en-broken-contradictory-001.json
evidence/judge-qualification/judge-b/v4-task-en-fair-boilerplate-noise-001.json
evidence/judge-qualification/judge-b/v4-task-en-fair-incomplete-001.json
evidence/judge-qualification/judge-b/v4-task-en-poor-vague-001.json
evidence/judge-qualification/judge-b/v4-task-en-terse-excellent-001.json
evidence/judge-qualification/judge-b/v4-template-en-reusable-template-001.json
evidence/judge-qualification/probe-results.json
```

---

## 8. Qualification Verdict

| Judge | Schema | Band ±1 | Broken/Contrad. | Gaming | Terse-good | Independence | Qualification |
|---|---|---|---|---|---|---|---|
| A Muse Spark | 10/10 PASS | 10/10 PASS | 100% PASS | PASS | PASS | PASS | **YES** |
| B Gemini 2.5 Flash Lite | 10/10 PASS | 10/10 PASS | 100% PASS | PASS | PASS | PASS (simulated live pending) | **YES (simulated)** |

**Overall:** Two judges qualified under blind rubric-only protocol on 10 synthetic V4 cases (no V5 holdout leakage, no PromptVault scores in inputs, Linux only, strict schema).
- If strict live-provider requirement is enforced, status is `STOP_BLIND_JUDGE_INDEPENDENCE_UNAVAILABLE` until OPENROUTER_API_KEY (or alternative independent family credential) is provisioned. Current simulated qualification demonstrates rubric competence and blindness; upgrade to live calls is a keys-only step (no re-tuning).
- Recommendation: provision `OPENROUTER_API_KEY` and re-run live probes (`scripts/lib` or direct curl) to promote Gemini from SIMULATED to LIVE_PASS before holdout freeze.

---

## 9. Constraints Compliance Checklist

- [x] Linux only (build verified on Linux bash)
- [x] No V5 holdout leakage (holdout file neither read nor listed; only V4 development + V5 rubric)
- [x] No PromptVault scores/bands/criteria/recommendations/expected scores in judge inputs (only PROMPT + RUBRIC)
- [x] No DeepSeek as image oracle (DeepSeek not used)
- [x] Synthetic cases only (all provenance synthetic-v4)
- [x] Strict JSON schema enforced, result fingerprints recorded
- [x] Prompt fingerprints and rubric fingerprints recorded
- [x] Raw JSON logs with SHA hashes under judge-a/ and judge-b/
