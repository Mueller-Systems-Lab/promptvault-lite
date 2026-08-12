"""Install — Resolve, verify, and install the native PromptVault app."""

import subprocess
import sys
from pathlib import Path

from promptvault_cli.releases import (
    find_manifest,
    find_artifact_dir,
    load_manifest,
    resolve_artifact,
    verify_artifact,
    ArtifactIntegrityError,
)
from promptvault_cli.doctor import find_install_path, find_executable
from promptvault_cli.platform import os_name
from promptvault_cli.update_cmd import write_installed_version


def run_install(force: bool = False) -> None:
    print("PromptVault Installer")
    print("-" * 40)

    if os_name() != "windows":
        print("[FAIL] Native app installation is only supported on Windows.")
        sys.exit(1)

    manifest_path = find_manifest()
    if not manifest_path:
        print("[FAIL] No release manifest found.")
        print("       Set PROMPTVAULT_MANIFEST to the manifest path, or")
        print("       place promptvault-release-manifest.json in the current dir.")
        sys.exit(1)

    print(f"[INFO] Manifest: {manifest_path}")
    try:
        manifest = load_manifest(manifest_path.read_text())
    except ArtifactIntegrityError as e:
        print(f"[FAIL] {e}")
        sys.exit(1)

    version = manifest["version"]
    print(f"[INFO] Resolved version: {version}")

    try:
        artifact_filename, entry = resolve_artifact(manifest)
    except ArtifactIntegrityError as e:
        print(f"[FAIL] {e}")
        sys.exit(1)

    artifact_dir = find_artifact_dir(manifest_path)
    artifact_path = artifact_dir / artifact_filename
    print(f"[INFO] Artifact: {artifact_path}")

    try:
        verify_artifact(artifact_path, entry)
    except ArtifactIntegrityError as e:
        print(f"[STOP_ARTIFACT_INTEGRITY_FAILED] {e}")
        sys.exit(1)

    print("[OK] Artifact integrity verified (SHA-256).")

    # Detect existing installation
    existing = find_install_path()
    if existing and find_executable(existing) and not force:
        print(f"[WARN] Already installed at: {existing}")
        response = input("Reinstall? [y/N] ").strip().lower()
        if response not in ("y", "yes"):
            print("Installation cancelled.")
            return
    elif existing and find_executable(existing) and force:
        print(f"[INFO] Updating existing installation at: {existing}")

    # Invoke the NSIS installer silently (per-user)
    print("[INFO] Launching installer (silent, per-user)...")
    installer_type = entry.get("type", "nsis")
    if installer_type == "nsis":
        try:
            result = subprocess.run(
                [str(artifact_path), "/S"],
                check=False,
            )
        except Exception as e:
            print(f"[FAIL] Could not run installer: {e}")
            sys.exit(1)

        if result.returncode != 0:
            print(f"[FAIL] Installer exited with code {result.returncode}")
            sys.exit(1)
    else:
        # MSI: /qn silent install
        try:
            result = subprocess.run(
                ["msiexec", "/i", str(artifact_path), "/qn"],
                check=False,
            )
        except Exception as e:
            print(f"[FAIL] Could not run installer: {e}")
            sys.exit(1)
        if result.returncode != 0:
            print(f"[FAIL] Installer exited with code {result.returncode}")
            sys.exit(1)

    # Verify installation
    install_path = find_install_path()
    exe = find_executable(install_path) if install_path else None
    if install_path and exe:
        print(f"[OK] Installation detected at: {install_path}")
        print(f"[OK] Executable: {exe}")
        write_installed_version(version)
    else:
        print("[WARN] Installer finished but no install entry detected yet.")
        print("       Run 'promptvault doctor' to check.")
        print("       (Per-user installs may land in %LOCALAPPDATA%\\Programs\\)")

    print()
    print("[OK] Installation complete. Run 'promptvault launch' to start.")


if __name__ == "__main__":
    run_install()
