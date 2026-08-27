# Support

## Getting Help

PromptVault Lite is a community project. Here is how to get help:

### Documentation

- **[README](README.md)** — Overview, quickstart, features, and architecture
- **[INSTALL.md](docs/INSTALL.md)** — Platform-specific installation guide
- **[USER_GUIDE.md](docs/USER_GUIDE.md)** — Usage instructions
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Technical architecture details

### Questions & Issues

- **[GitHub Issues](https://github.com/Mueller-Systems-Lab/promptvault-lite/issues)** — Bug reports and feature requests
- **[GitHub Discussions](https://github.com/Mueller-Systems-Lab/promptvault-lite/discussions)** — Questions and community discussion

### Security Vulnerabilities

See **[SECURITY.md](SECURITY.md)** for responsible disclosure.

## Troubleshooting

| Problem                     | Solution                                                                    |
| --------------------------- | --------------------------------------------------------------------------- |
| `pnpm` or `cargo` not found | Verify tools are in PATH                                                    |
| App does not start          | Run `pnpm install` again                                                    |
| Scan finds no files         | Scanner only processes `.md` files                                          |
| Export/favorites seem stuck | First call on large collections may take several seconds                    |
| Build issues                | Check platform-specific Tauri dependencies in [INSTALL.md](docs/INSTALL.md) |

## Current Status

**v1.7.1** is the current stable release (published 2026-06-24). A Windows x64 installer is available on the [GitHub Releases](https://github.com/Mueller-Systems-Lab/promptvault-lite/releases) page. The installer is **unsigned** — Windows SmartScreen may show an "Unknown publisher" warning. Source install remains available for developers via `pnpm install && pnpm start`.
