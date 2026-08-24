#!/usr/bin/env python3
"""Version consistency check.

Asserts that canonical version sources agree within their release stream.
The desktop application and the Windows-only CLI may intentionally have
different versions when the current host cannot produce the CLI's native
Windows installer.

Usage:
    python scripts/check_version_consistency.py [expected-version]

Without an argument the expected desktop version is derived from
``package.json``. An explicit CLI argument overrides the desktop expectation;
the separate CLI expectation is always derived from its own ``pyproject.toml``.

Exit code 0 when all sources agree, non-zero otherwise.
"""

import json
import re
import sys
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

DESKTOP_SOURCES = {
    "package.json": REPO_ROOT / "package.json",
    "src-tauri/Cargo.toml": REPO_ROOT / "src-tauri" / "Cargo.toml",
    "src-tauri/tauri.conf.json": REPO_ROOT / "src-tauri" / "tauri.conf.json",
}

CLI_SOURCES = {
    "tools/promptvault-cli/pyproject.toml": REPO_ROOT
    / "tools"
    / "promptvault-cli"
    / "pyproject.toml",
    "tools/promptvault-cli/__init__.py": REPO_ROOT
    / "tools"
    / "promptvault-cli"
    / "src"
    / "promptvault_cli"
    / "__init__.py",
    "release-manifest.json": REPO_ROOT
    / "tools"
    / "promptvault-cli"
    / "promptvault-release-manifest.json",
}


def read_version(path: Path) -> str:
    if path.name == "package.json":
        return json.loads(path.read_text())["version"]
    if path.name == "tauri.conf.json":
        return json.loads(path.read_text())["version"]
    if path.name == "Cargo.toml":
        data = tomllib.loads(path.read_text())
        return data["package"]["version"]
    if path.name == "pyproject.toml":
        data = tomllib.loads(path.read_text())
        return data["project"]["version"]
    if path.name == "__init__.py":
        text = path.read_text()
        match = re.search(r'__version__\s*=\s*"([^"]+)"', text)
        if not match:
            raise ValueError("__version__ not found")
        return match.group(1)
    if path.name == "promptvault-release-manifest.json":
        return json.loads(path.read_text())["version"]
    raise ValueError(f"Unknown source: {path}")


def _default_expected_version() -> str:
    """Derive the expected version from the desktop package.json."""
    package = REPO_ROOT / "package.json"
    return json.loads(package.read_text())["version"]


def _default_cli_expected_version() -> str:
    """Derive the expected version for the separate CLI release stream."""
    pyproject = REPO_ROOT / "tools" / "promptvault-cli" / "pyproject.toml"
    return tomllib.loads(pyproject.read_text())["project"]["version"]


def main() -> int:
    expected = sys.argv[1] if len(sys.argv) > 1 else _default_expected_version()
    failures: list[str] = []
    versions: dict[str, str] = {}
    # The desktop application and the Windows-only native-installer CLI are
    # intentionally separate release streams.  A Linux desktop release must
    # not claim that an unbuilt Windows installer exists for the same version.
    sources = {**DESKTOP_SOURCES, **CLI_SOURCES}
    cli_expected = _default_cli_expected_version()
    for label, path in sources.items():
        try:
            versions[label] = read_version(path)
        except Exception as e:
            failures.append(f"{label}: could not read ({e})")
            continue
        group_expected = expected if label in DESKTOP_SOURCES else cli_expected
        if versions[label] != group_expected:
            failures.append(f"{label}: {versions[label]} (expected {group_expected})")

    print(f"VERSION CONSISTENCY (expected {expected})")
    for label, version in versions.items():
        group_expected = expected if label in DESKTOP_SOURCES else cli_expected
        marker = "PASS" if version == group_expected else "FAIL"
        stream = "desktop" if label in DESKTOP_SOURCES else "cli"
        print(f"  [{marker}] {stream} {label}: {version}")

    if failures:
        print("VERSION_CONSISTENCY: FAIL")
        for f in failures:
            print(f"  - {f}")
        return 1

    print("VERSION_CONSISTENCY: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
