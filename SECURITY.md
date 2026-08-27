# Security Policy

## Reporting a Vulnerability

PromptVault Lite is a local-first desktop application. Security issues are taken seriously.

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them via:

- **Security Advisory:** If available, use GitHub's [private security advisory](https://github.com/Mueller-Systems-Lab/promptvault-lite/security/advisories/new) workflow.
- **Minimal Issue (fallback):** If private advisories are unavailable, create a GitHub issue labeled `security` with only the word "security" in the body — we will reach out with a secure channel for the full report.
- **PGP:** Not currently available.

## Scope

Security concerns relevant to PromptVault Lite include:

- Path traversal in file scanning or export
- Symlink escape from vault root
- Secret/PII exposure through the UI or export
- Dependency vulnerabilities with local impact
- Tauri IPC command abuse

## Supported Versions

| Version                   | Supported |
| ------------------------- | --------- |
| v1.7.1 (current stable)   | ✅        |
| v1.7.0                    | ✅        |
| v1.6.0                    | ✅        |
| v1.5.0-rc.1 (pre-release) | ✅        |
| Earlier versions          | ❌        |

## Security Design

- All processing is local — no cloud backend, no API calls, no telemetry
- Prompt Optimizer is deterministic and runs entirely offline
- Symlink containment blocks access outside the vault root
- Export paths are validated with `canonicalize` to prevent path traversal
- CI pipeline includes automated secret scanning
- No `.env` files or external secret management

## Disclosure

We aim to acknowledge reports within 72 hours and provide a timeline for resolution. Coordinated disclosure is preferred.
