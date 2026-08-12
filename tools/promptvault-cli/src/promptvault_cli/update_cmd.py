"""Update — Check for native app updates against the release manifest.

The update command compares the installed native app version (tracked in
~/.promptvault/installed-version.txt, written by `promptvault install`)
against the version in the release manifest. If a newer version exists,
it invokes the same verified install path.
"""

import sys
import os
import json
from pathlib import Path

from promptvault_cli.releases import (
    find_manifest,
    load_manifest,
    ArtifactIntegrityError,
)
from promptvault_cli.doctor import find_install_path, find_executable

APP_VERSION = "1.9.0"
STATE_DIR = Path.home() / ".promptvault"
INSTALLED_VERSION_FILE = STATE_DIR / "installed-version.txt"
RELEASES_API = "https://api.github.com/repos/xxammaxx/promptvault-lite/releases/latest"


def read_installed_version() -> str | None:
    if INSTALLED_VERSION_FILE.exists():
        try:
            return INSTALLED_VERSION_FILE.read_text().strip()
        except OSError:
            return None
    return None


def write_installed_version(version: str) -> None:
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        INSTALLED_VERSION_FILE.write_text(version)
    except OSError:
        pass


def run_update() -> None:
    print("PromptVault Updater")
    print("-" * 40)
    print(f"[INFO] Current CLI version: {APP_VERSION}")

    installed_version = read_installed_version()
    if installed_version:
        print(f"[INFO] Installed native app version: {installed_version}")
    else:
        install_path = find_install_path()
        if install_path and find_executable(install_path):
            print("[WARN] Native app installed but version unknown (no state file).")
        else:
            print("[WARN] Native app not installed. Run 'promptvault install' first.")
            return

    manifest_path = find_manifest()
    if not manifest_path:
        print("[INFO] No local release manifest found.")
        print("[INFO] Checking GitHub releases (read-only)...")
        try:
            from urllib.request import urlopen, Request

            req = Request(
                RELEASES_API,
                headers={"User-Agent": "promptvault-cli", "Accept": "application/json"},
            )
            with urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())
            latest = data.get("tag_name", "").lstrip("v")
            print(f"[INFO] Latest GitHub release: {latest if latest else 'unknown'}")
            if latest and installed_version and latest != installed_version:
                print(f"[INFO] Update available: {installed_version} -> {latest}")
                print(f"[INFO] Download from: {data.get('html_url')}")
            elif latest:
                print("[OK] No newer release detected.")
        except Exception as e:
            print(f"[WARN] Could not reach GitHub: {e}")
        return

    try:
        manifest = load_manifest(manifest_path.read_text())
    except ArtifactIntegrityError as e:
        print(f"[FAIL] Invalid manifest: {e}")
        sys.exit(1)

    available_version = manifest.get("version", "unknown")
    print(f"[INFO] Available native version: {available_version}")

    if installed_version and installed_version == available_version:
        print("[OK] Native app is up to date.")
        return

    if installed_version:
        print(f"[INFO] Update available: {installed_version} -> {available_version}")
    else:
        print(f"[INFO] Native app version {available_version} available for install.")

    response = input("Apply update? [y/N] ").strip().lower()
    if response not in ("y", "yes"):
        print("Update cancelled.")
        return

    # Invoke the same verified install path.
    from promptvault_cli.install_cmd import run_install

    run_install(force=True)
    write_installed_version(available_version)
    print(f"[OK] Updated to {available_version}.")


if __name__ == "__main__":
    run_update()
