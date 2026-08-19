# PVL v1.11.1 — MCP Foundation Run Report (2026-08-19)

> Milestone: Linux-only public demo + GitHub Pages product website
> Mandate section: PHASE 0 — HARD MCP FOUNDATION GATE
> Classification: **MCP_FOUNDATION_GREEN**

---

## 1. MCP Runtime Discovery (live CLI help = source of truth)

| Item | Value |
|---|---|
| OpenCode version | 1.18.18 |
| MCP runtime | `opencode mcp` (add / list / auth / logout / debug) |
| MCP config location | `~/.config/opencode/opencode.jsonc` (user-level, NOT committed) |
| Previously installed servers | 0 (fresh) |
| GitHub credential | PAT via git credential store (scopes: `repo, workflow, read:user, user:email`, 5000 req/hr) |
| OS | Linux Mint 22.1, bash |

## 2. Required MCP Matrix

| Capability | Server | Version | Source | Install | Auth | Read Test | Write Test | Final |
|---|---|---|---|---|---|---|---|---|
| GitHub | `github` (github/github-mcp-server) | v1.9.0 | Official GitHub release, SHA256 verified (`cbf38bd…`) | Binary → `~/.local/bin/github-mcp-server` | PAT via `{env:GITHUB_PERSONAL_ACCESS_TOKEN}` | PASS | N/A (no artificial writes per mandate §9) | HEALTHY |
| Browser/Playwright | `playwright` (@playwright/mcp) | 0.0.79 | Official Microsoft npm package (pinned) | `~/.opencode/mcp/playwright-mcp` | none | PASS | PASS | HEALTHY |
| Vision | n/a — routed to `openai/gpt-5.4-mini-fast` (existing OAuth) | — | OpenAI OAuth | none | none | PASS (semantic) | PASS | HEALTHY |

Not installed (per capability-minimal rule): filesystem, shell, git MCP (OpenCode native), vision MCP (vision-capable model verified instead), context7/brave (no research gap), docker (no Docker host).

## 3. GitHub MCP Smoke Test (read-only, real execution)

| Check | Result |
|---|---|
| Repo metadata | PASS — promptvault-lite, default_branch=master |
| Default branch HEAD | PASS — a6bb135f371dbf05d4076b562ffa7f766c4fdf74 |
| Latest release | PASS — v1.11.1 |
| Repo file read | PASS — README.md (SHA 7d50c44…) |
| Actions info | PASS — 2 workflows (ci.yml, publish-pypi.yml); ci.yml run #212 completed/failure (remote CI infra-blocked, consistent with AGENTS.md §3 / Issue #154) |
| Pages status | NOT SUPPORTED by github MCP toolset — recorded limitation; verified via REST API instead (404 = Pages not enabled) |

## 4. Playwright MCP Smoke Test (real browser, local HTTP page)

| Check | Result |
|---|---|
| Browser start/navigate | PASS — http://127.0.0.1:8791/ |
| DOM inspect | PASS — h1 = "PromptVault Lite MCP Test" |
| Interaction | PASS — button click changed result text |
| Screenshot | PASS — PNG 962×481 (after raising MCP timeout 5s→30s for font loading) |
| Console | PASS — 0 errors |
| Network | PASS — requests inspectable |

Note: `playwright_browser_take_screenshot` restricts writes to workspace roots (`.playwright-mcp/`, repo root) — documented behavior, `.playwright-mcp/` is gitignored (`.gitignore:65`).

## 5. Vision Capability Test (semantic, not OCR)

| Check | Result |
|---|---|
| VISION_IMAGE_INPUT | PASS — `openai/gpt-5.4-mini-fast` (OpenAI OAuth) |
| VISION_SEMANTIC_DESCRIPTION | PASS — identified heading "VISION TEST", button "BUTTON", green box from synthetic image; later re-verified on real Playwright screenshot (h1 "PromptVault Lite MCP Test", button "Klick mich") |

Active orchestrator model `deepseek/deepseek-v4-flash` does NOT support image input (verified: Read tool returns "this model does not support image input") — visual review is routed to the verified vision-capable model per mandate §31.

## 6. Security / Supply-Chain

- GitHub MCP: official first-party binary, SHA256 checksum verified against release checksums file.
- Playwright MCP: official Microsoft npm package, pinned 0.0.79, installed locally (no `npx -y`).
- Token referenced via `{env:GITHUB_PERSONAL_ACCESS_TOKEN}` — never stored in config files.
- No MCP config or credentials committed to the repository (git status shows none).
- No tokens/keys printed in any log.

## 7. MCP_FOUNDATION_GREEN Checklist

- [x] OpenCode MCP runtime discovered (1.18.18)
- [x] Required MCP list justified (GitHub + Playwright; vision via verified model)
- [x] Provenance checked (official sources, pinned versions, SHA verified)
- [x] Required servers installed
- [x] Connections healthy (`opencode mcp list` → both ✓ connected)
- [x] Authentication healthy (PAT, correct scopes)
- [x] GitHub read capability PASS
- [x] Browser/Playwright capability PASS
- [x] Visual capability PASS (semantic)
- [x] No secrets exposed
- [x] No unnecessary MCP installed

**MCP_FOUNDATION: GREEN**
