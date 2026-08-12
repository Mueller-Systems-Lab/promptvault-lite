# PromptVault CLI

## Local Prompt Management Installer & Manager

This is the Python CLI installer for [PromptVault Lite](https://github.com/xxammaxx/promptvault-lite),
a local prompt-management system with quality and hygiene analysis.

### Installation

```bash
uv tool install promptvault-cli
```

Or from a local wheel:

```bash
uv tool install ./dist/promptvault_cli-1.9.0-py3-none-any.whl
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
uv tool uninstall promptvault-cli
```

### Requirements

- Python >= 3.11
- [uv](https://docs.astral.sh/uv/) for package management
