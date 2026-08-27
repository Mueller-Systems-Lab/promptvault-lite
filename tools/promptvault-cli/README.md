# PromptVault CLI

## Local Prompt Management Installer & Manager

This is the Python CLI installer for [PromptVault Lite](https://github.com/Mueller-Systems-Lab/promptvault-lite),
a local prompt-management system with quality and hygiene analysis.

> **Publication status:** The `v1.11.1` GitHub Release (Windows installer + release
> manifest + checksums) is published. The Python distribution
> `promptvault-lite-manager==1.11.1` is **published on PyPI** — install it with
> `uv tool install promptvault-lite-manager`.

### Installation

```bash
uv tool install promptvault-lite-manager
```

### Usage

```bash
promptvault --version
promptvault --help
promptvault doctor          # Check system and installation status
promptvault install          # Install native PromptVault app
promptvault launch           # Start the native app
promptvault update           # Check for app updates
promptvault diagnostics      # View diagnostic status
promptvault uninstall        # Remove native app (keeps vault data)
```

### Uninstall

```bash
# First uninstall the native app
promptvault uninstall

# Then remove the CLI
uv tool uninstall promptvault-lite-manager
```

### Requirements

- Python >= 3.11
- [uv](https://docs.astral.sh/uv/) for package management

### Documentation

See [`docs/CLI.md`](../../docs/CLI.md) for the full CLI reference, the uv-tool vs.
native-app distinction, and the current publication status.
