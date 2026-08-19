# PVL v1.11.1 — Risk Tier Routing (2026-08-19)

## Milestone
Linux-only public demo + GitHub Pages product website (master prompt 2026-08-19).

## Tier: HIGH_HUMAN_GATE

**Triggered by (highest applicable per tiebreaker rule):**
- External system involvement: read-write GitHub API + GitHub Pages deployment (MCP servers in use)
- Public-facing artifact: website claims accuracy is a real risk (claim inaccuracy = STOP_WEBSITE_CLAIM_INACCURATE)
- Demo privacy: PII-adjacent (demo frames must be free of private paths/usernames; privacy review gates mandatory)
- Files affected: 10–15 (website/, pages.yml, README, docs/audits reports)

**Required modules:**
- Speckit (full): spec → plan → tasks — satisfied by the master prompt's mandated agent sequence (§54)
- Read Before Sketch / Reality Refresh — done (Agent #1)
- Run Card — the mandate's §58 SUCCESS DEFINITION acts as the run card contract
- Security Evidence Gate — mapped to DEMO_PRIVACY_REVIEWER + DETERMINISTIC_TEXT_PRIVACY_SCAN
- Compliance / Privacy — mapped to DEMO_PRIVACY_REVIEWER + website tracker-free contract (§40)
- Infrastructure Review — GitHub Pages deployment (§47–49)
- Documentation Update — README link (§51), run reports
- Test Enforcement — DEMO_DRY_RUN, PUBLIC_SITE_QA, PUBLIC_PAGES_RUNTIME gates
- Review Agent — Agent #8, #9, #10 (MUST PASS)
- Human Approval Gate — owner authorization basis: this master prompt (explicit standing authorization for commit/integrate/deploy §44–49). New not-yet-authorized effects get bundled owner questions.

**Conditional modules activated:**
- safety (demo recording privacy)
- infrastructure (GitHub Pages)
- compliance (no tracking, privacy-safe claims)

**ASSUMPTION / overrides:**
- GitHub Issues: repo operates via prompt-file governance (docs/agents/ empty; no issue-tracker.md). Per github-source-of-truth skill, local run report is the temporary source of truth. No artificial issue will be created.
- No governance/policy-core.yaml exists (verified by Agent #1); governance lives in `.opencode/policies/`. Risk routing uses the skill + mandate.
