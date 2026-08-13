#!/usr/bin/env python3
"""Version consistency check.

Asserts that every canonical version source in the repository reports the
same release version. Used as a pre-release gate to prevent version drift
(e.g. Desktop 1.8.0 vs CLI 1.9.0 vs manifest 1.9.0).

Usage:
    python scripts/check_version_consistency.py [expected-version]

Exit code 0 when all sources agree, non-zero otherwise.
"""

import json
import re
import sys
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

SOURCES = {
    "package.json": REPO_ROOT / "package.json",
    "src-tauri/Cargo.toml": REPO_ROOT / "src-tauri" / "Cargo.toml",
    "src-tauri/tauri.conf.json": REPO_ROOT / "src-tauri" / "tauri.conf.json",
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


def main() -> int:
    expected = sys.argv[1] if len(sys.argv) > 1 else "1.9.1"
    failures: list[str] = []
    versions: dict[str, str] = {}
    for label, path in SOURCES.items():
        try:
            versions[label] = read_version(path)
        except Exception as e:
            failures.append(f"{label}: could not read ({e})")
            continue
        if versions[label] != expected:
            failures.append(f"{label}: {versions[label]} (expected {expected})")

    print(f"VERSION CONSISTENCY (expected {expected})")
    for label, version in versions.items():
        marker = "PASS" if version == expected else "FAIL"
        print(f"  [{marker}] {label}: {version}")

    if failures:
        print("VERSION_CONSISTENCY: FAIL")
        for f in failures:
            print(f"  - {f}")
        return 1

    print("VERSION_CONSISTENCY: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
