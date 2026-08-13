# PromptVault CLI

## Local Prompt Management Installer & Manager

This is the Python CLI installer for [PromptVault Lite](https://github.com/xxammaxx/promptvault-lite),
a local prompt-management system with quality and hygiene analysis.

> **Publication status:** The `v1.9.0` GitHub Release (Windows installer + release
> manifest + checksums) is published. This Python package is **not yet published**
> to PyPI — `uv tool install promptvault-lite-manager` is pending a package-index
> publication (secure publish auth required). Until then, install from a locally
> built wheel.

### Installation (from a locally built wheel)

```bash
uv build
uv tool install ./dist/promptvault_lite_manager-1.9.0-py3-none-any.whl
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
